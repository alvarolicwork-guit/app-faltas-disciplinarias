import { annotateSanctions } from "@/lib/server/chain-views";
import { queryPage } from "@/lib/server/query-page";
import { touchStats } from "@/lib/server/stats-cache";
import { ChainError, matchesDecision, newChainMetadata, snapshotChain } from "@/lib/domain/recurrence-chain";
import { assertDecisionAvailable, conductForInput, evaluateInTransaction, publicDecision } from "@/lib/server/recurrence";
import { canRequestCancellation, authorUid, cancellationDeadline } from "@/lib/domain/sanction-policy";
import { DISCIPLINARY_CATALOG } from "@/lib/domain/disciplinary-catalog";
import { cancelDirectly } from "@/lib/server/cancellations";
import { assertCurrentActor, readConfirmation, operationError, OperationError } from "@/lib/server/operations";
import { DocumentData, Query, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import {
  USER_ROLES_CAN_REGISTER_FALTA,
  USER_ROLES_UNIT_SCOPE,
} from "@/lib/domain/constants";
import { canRegisterHistoricalFalta, canViewGlobalPersonHistory } from "@/lib/domain/roles";
import {
  articleNumber,
  incisoNumber,
  isRegimenDisciplinarioReferral,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";
import {
  createFaltaSchema,
  listFaltasSearchSchema,
} from "@/lib/domain/schemas";
import {
  parseFechaSancion,
} from "@/lib/faltas/reincidencia";
import { getAdminDb } from "@/lib/firebase/admin";

function forbidden(message = "No autorizado") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function unauthorized(message = "Token invalido o ausente") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message = "Solicitud invalida") {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function timestampToIsoDate(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    return date?.toISOString?.() ?? null;
  }
  return null;
}

function buildReferenciaFromFalta(faltaId: string, falta: DocumentData) {
  return {
    faltaId,
    fechaSancion: timestampToIsoDate(falta.fechaSancion),
    memorandum: falta.memorandum,
    unidadNombre: falta.unidadSancionNombre ?? falta.unidadNombre,
  };
}

function serializeReincidenciaOrigen(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    ...item,
    fechaSancionReferencia: timestampToIsoDate(item.fechaSancionReferencia) ?? item.fechaSancionReferencia ?? null,
    origenReincidenciaPrevia: item.origenReincidenciaPrevia
      ? serializeReincidenciaOrigen(item.origenReincidenciaPrevia)
      : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);

    if (!actor) {
      return unauthorized();
    }

    if (!USER_ROLES_CAN_REGISTER_FALTA.has(actor.role)) {
      return forbidden();
    }

    const body = await request.json();
    const parsed = createFaltaSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const input = parsed.data;
    const validArticle = DISCIPLINARY_CATALOG.find((a) => sameArticulo(a.label, input.articulo));
    if (!validArticle || !validArticle.incisos.some((i) => incisoNumber(i) === incisoNumber(input.inciso))) return badRequest("Artículo/inciso fuera del catálogo");
    input.articulo = validArticle.label;
    input.inciso = validArticle.incisos.find((i) => incisoNumber(i) === incisoNumber(input.inciso))!;
    const userIsUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);
    const modoRegistro = input.modoRegistro ?? "actual";
    const isHistoricalRegistration = modoRegistro === "historico";

    if (!input.personalId || !input.unidadId) {
      return badRequest("personalId y unidadId son requeridos");
    }

    if (isRegimenDisciplinarioReferral(input.articulo, input.inciso)) {
      return forbidden("Art. 12 inc. 1 corresponde a remision a Regimen Disciplinario y no puede registrarse como falta en esta app");
    }

    if (isHistoricalRegistration && !canRegisterHistoricalFalta(actor.role)) {
      return forbidden("Solo admin_dpto o super_admin pueden registrar sanciones historicas");
    }

    if (userIsUnitScoped && actor.unidadId !== input.unidadId) {
      return forbidden("No puede registrar faltas fuera de su unidad");
    }

    const adminDb = getAdminDb();

    const personalRef = adminDb.collection("personal").doc(input.personalId);
    const faltaRef = adminDb.collection("faltas").doc();
    const reincidenciaBloqueadaRef = adminDb.collection("reincidencias_bloqueadas").doc();
    const auditRef = adminDb.collection("audit_logs").doc();

    const result = await adminDb.runTransaction(async (tx) => {
      await assertCurrentActor(tx, adminDb, actor);
      const confirmation = await readConfirmation(tx, adminDb, actor, body.confirmationId, "registrar_sancion", body.payloadConfirmado);
      // Hash the actual normalized business payload, never a parallel client claim.
      if (JSON.stringify(createFaltaSchema.parse(body.payloadConfirmado)) !== JSON.stringify(createFaltaSchema.parse(body))) throw new OperationError("Los datos cambiaron desde su confirmación", 400);
      if (confirmation.data.result) return { blocked: false as const, faltaId: String(confirmation.data.result.faltaId) };
      const personalSnap = await tx.get(personalRef);

      if (!personalSnap.exists) {
        throw new Error("PERSONAL_NOT_FOUND");
      }

      const personal = personalSnap.data()!;



      const fechaSancion = parseFechaSancion(input.fechaSancion);
      const fechaSancionTs = Timestamp.fromDate(fechaSancion);

      const unidadSancionId = safeString(userIsUnitScoped ? actor.unidadId : input.unidadId).trim();
      const isSancionEscalada = isReincidenciaEscalada(input.articulo, input.inciso);

      let unidadSancionNombre = "";
      {
        const unidadSancionSnap = await tx.get(adminDb.collection("unidades").doc(unidadSancionId));
        if (!unidadSancionSnap.exists) {
          throw new Error("UNIDAD_DATA_MISSING");
        }
        const unidadSancion = unidadSancionSnap.data()!;
        if (unidadSancion.estado !== "activa") throw new OperationError("La unidad sancionadora no está activa", 403);
        unidadSancionNombre = safeString(unidadSancion.nombre).trim();
      }

      if (!unidadSancionId || !unidadSancionNombre) {
        throw new Error("UNIDAD_DATA_MISSING");
      }

      if (!personal.ci || !personal.nombreCompleto || !personal.grado) {
        throw new Error("PERSONAL_DATA_INCOMPLETE");
      }

      const personalCi = safeString(personal.ci).trim();
      const personalNombreCompleto = safeString(personal.nombreCompleto).trim();
      const personalGrado = safeString(personal.grado).trim();

      if (!personalCi || !personalNombreCompleto || !personalGrado) {
        throw new Error("PERSONAL_DATA_INCOMPLETE");
      }

      const unidadEfectivoId = null;
      const unidadEfectivoNombre = null;

      let reincidenciaOrigen: Record<string, unknown> | null = null;

      const allSnap = await tx.get(adminDb.collection("faltas").where("personalId", "==", input.personalId));
      const conduct = conductForInput(allSnap.docs.map(d => ({ ...d.data(), id: d.id })), input);
      const evaluation = await evaluateInTransaction(tx, adminDb, input.personalId, input.fechaSancion, conduct.articulo, conduct.inciso);
      const { decision, bloqueo, decisionVersion } = evaluation;
      if (input.decisionVersion && input.decisionVersion !== decisionVersion) throw new OperationError("Los antecedentes cambiaron. Revise y confirme la evaluación actualizada");
      assertDecisionAvailable(bloqueo);
      if (!matchesDecision(input.articulo, input.inciso, input.reincidenciaOrigen?.faltaReferenciaId ?? null, decision)) {
        const referenceRow = decision.nodes.at(-1);
        const proposal = publicDecision(decision, bloqueo, decisionVersion, evaluation.habilitacionAntecedentes.rechazosExpresos);
        const blockedPayload = { personalId: input.personalId, unidadIntentoId: unidadSancionId, unidadIntentoNombre: unidadSancionNombre,
          articuloIntentado: input.articulo, incisoIntentado: input.inciso, conductaOrigen: conduct,
          fechaSancionIntentada: fechaSancionTs, estado: "bloqueada", actor: { uid: actor.uid, role: actor.role },
          motivoBloqueo: "decision_cadena", sancionSugerida: decision.sancion, createdAt: Timestamp.now() };
        tx.set(reincidenciaBloqueadaRef, blockedPayload);
        touchStats(tx,adminDb);
        tx.set(auditRef, { actorUid: actor.uid, actorRole: actor.role, action: "block_reincidencia", entity: "reincidencia_bloqueada",
          entityId: reincidenciaBloqueadaRef.id, unidadId: unidadSancionId, before: null, after: blockedPayload, createdAt: Timestamp.now() });
        return { blocked: true as const, reincidenciaBloqueadaId: reincidenciaBloqueadaRef.id,
          sancionSugerida: decision.sancion, reincidenciaOrigen: proposal.reincidenciaOrigen,
          referencia: referenceRow ? buildReferenciaFromFalta(referenceRow.id, referenceRow) : null,
          motivoCadena: decision.tipo === "base" ? "La cadena anterior venció o no existe fundamento vigente. Corresponde registrar una nueva sanción base." : "La sanción debe corresponder al último escalón de esta conducta y su cadena vigente.",
          requiereRemisionDisciplinaria: decision.tipo === "remision", remisionMensaje: decision.sancion.remisionMensaje ?? null };
      }
      reincidenciaOrigen = snapshotChain(decision.nodes);
      const chainMetadata = decision.metadata ?? newChainMetadata(faltaRef.id, conduct, input.fechaSancion);

      tx.set(personalRef, { workflowUpdatedAt: Timestamp.now() }, { merge: true });
      const faltaPayload = {
        ...(evaluation.skipRegistrationWait ? {pruebaLocalSinEspera:true} : {}),
        confirmacion: { id: confirmation.ref.id, textoVersion: "intencion-v1", fecha: Timestamp.now(), hash: confirmation.data.hash, actorUid: actor.uid },
        ...chainMetadata,
        habilitacionAntecedentes: evaluation.habilitacionAntecedentes,
        fundamentoOriginal: { ...chainMetadata, articulo: input.articulo, inciso: input.inciso, reincidenciaOrigen },
        personalId: input.personalId,
        unidadId: unidadSancionId,
        unidadNombre: unidadSancionNombre,
        unidadSancionId,
        unidadSancionNombre,
        unidadEfectivoId,
        unidadEfectivoNombre,
        ci: personalCi,
        nombreCompleto: personalNombreCompleto,
        grado: personalGrado,
        articulo: input.articulo,
        inciso: input.inciso,
        fechaSancion: fechaSancionTs,
        memorandum: input.memorandum,
        motivo: input.motivo,
        tipoRegistro: isSancionEscalada ? "reincidencia_escalada" : "falta_directa",
        modoRegistro,
        cargaHistorica: isHistoricalRegistration,
        unidadActualEfectivoId: null,
        unidadActualEfectivoNombre: null,
        reincidencia: isSancionEscalada,
        reincidenciaReferencia: reincidenciaOrigen,
        reincidenciaOrigen,
        requiereRemisionDisciplinaria: articleNumber(input.articulo) === 12 && incisoNumber(input.inciso) === 1,
        remisionMensaje: articleNumber(input.articulo) === 12 && incisoNumber(input.inciso) === 1
          ? "Corresponde remitir todos los actuados a Régimen Disciplinario del Comando Departamental de Policía."
          : null,
        estado: "registrada",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
        },
        updatedBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
        },
      };

      tx.set(faltaRef, faltaPayload);
      touchStats(tx,adminDb);
      tx.update(confirmation.ref, { result: { faltaId: faltaRef.id }, consumedAt: Timestamp.now() });
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "create_falta",
        entity: "falta",
        entityId: faltaRef.id,
        unidadId: unidadSancionId,
        modoRegistro,
        cargaHistorica: isHistoricalRegistration,
        unidadEfectivoHistoricaId: isHistoricalRegistration ? unidadEfectivoId : null,
        before: null,
        after: faltaPayload,
        createdAt: Timestamp.now(),
      });

      return {
        blocked: false as const,
        faltaId: faltaRef.id,
      };
    });

    if (result.blocked) {
      return NextResponse.json(
        {
          error: "REINCIDENCIA_BLOCKED",
          message: result.motivoCadena,
          reincidenciaBloqueadaId: result.reincidenciaBloqueadaId,
          sancionSugerida: result.sancionSugerida,
          reincidenciaOrigen: result.reincidenciaOrigen,
          referencia: result.referencia,
          motivoCadena: result.motivoCadena,
          requiereRemisionDisciplinaria: result.requiereRemisionDisciplinaria,
          remisionMensaje: result.remisionMensaje,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        faltaId: result.faltaId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/faltas failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
    });

    if (error instanceof OperationError || error instanceof ChainError) return operationError(error);
    if (error instanceof Error) {
      if (error.message === "PERSONAL_NOT_FOUND") {
        return badRequest("No se encontro personalId en la coleccion personal");
      }

      if (error.message === "PERSONAL_OUTSIDE_UNIT") {
        return forbidden("No puede registrar personal fuera de su unidad");
      }

      if (error.message.includes("fechaSancion")) {
        return badRequest("fechaSancion invalida, usar formato YYYY-MM-DD");
      }

      if (error.message === "UNIDAD_DATA_MISSING") {
        return badRequest("No se pudo determinar la unidad de sanción. Verifique el usuario y el personal seleccionado");
      }

      if (error.message === "HISTORICAL_UNIT_REQUIRED") {
        return badRequest("Debe seleccionar la unidad donde prestaba funciones al momento de la sancion");
      }

      if (error.message === "HISTORICAL_UNIT_NOT_FOUND") {
        return badRequest("La unidad historica seleccionada no existe o no tiene nombre oficial");
      }

      if (error.message === "PERSONAL_DATA_INCOMPLETE") {
        return badRequest("El personal seleccionado tiene datos incompletos (CI, grado o nombre)");
      }

      if (error.message.startsWith("REINCIDENCIA_ORIGIN")) {
        return badRequest("El origen de reincidencia no es valido para la sancion superior seleccionada");
      }

      const firestoreCode = (error as Error & { code?: string }).code;
      if (firestoreCode === "failed-precondition") {
        return NextResponse.json(
          {
            error: "Configuración incompleta de Firestore para la consulta de reincidencia",
            details: error.message,
          },
          { status: 500 },
        );
      }

      if (firestoreCode === "invalid-argument") {
        return badRequest(`Datos inválidos para registrar falta: ${error.message}`);
      }
    }

    return NextResponse.json(
      {
        error: "No se pudo registrar la falta",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);

    if (!actor) {
      return unauthorized();
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listFaltasSearchSchema.safeParse(searchParams);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const {
      q,
      personalId,
      unidadId,
      scope,
      articulo,
      inciso,
      fechaInicio,
      fechaFin,
      reincidencia,
      estado,
    } = parsed.data;

    const adminDb = getAdminDb();

    let query: Query<DocumentData> = adminDb.collection("faltas");

    const userIsUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);
    const isGlobalPersonScope = scope === "global_person";

    if (isGlobalPersonScope) {
      if (!canViewGlobalPersonHistory(actor.role)) {
        return forbidden("No tiene permisos para consultar historial global por efectivo");
      }

      if (!personalId) {
        return badRequest("personalId requerido para historial global");
      }
    }

    const scopedUnidadId = isGlobalPersonScope ? "" : (userIsUnitScoped ? actor.unidadId : unidadId);
    if (personalId && !scopedUnidadId && !canViewGlobalPersonHistory(actor.role)) {
      return forbidden("Seleccione una unidad para consultar este historial; para registrar use la consulta de antecedentes");
    }

    if (personalId) {
      query = query.where("personalId", "==", personalId);
    }

    if (scopedUnidadId) {
      query = query.where("unidadId", "==", scopedUnidadId);
    }


    if (reincidencia) {
      query = query.where("reincidencia", "==", reincidencia === "true");
    }

    if (estado) {
      query = query.where("estado", "==", estado);
    }

    if (fechaInicio) {
      query = query.where(
        "fechaSancion",
        ">=",
        Timestamp.fromDate(parseFechaSancion(fechaInicio)),
      );
    }

    if (fechaFin) {
      const endDate = parseFechaSancion(fechaFin);
      endDate.setUTCHours(23, 59, 59, 999);
      query = query.where(
        "fechaSancion",
        "<=",
        Timestamp.fromDate(endDate),
      );
    }

    query = query.orderBy("fechaSancion", "desc");

    const textFilter = q?.trim().toLowerCase() ?? "";
    const matches=(row:DocumentData)=>{
      if(articulo&&!sameArticulo(String(row.articulo??""),articulo))return false;
      if(inciso&&incisoNumber(String(row.inciso??""))!==incisoNumber(inciso))return false;
      return !textFilter||[row.nombreCompleto,row.ci,row.memorandum].some(value=>String(value??"").toLowerCase().includes(textFilter));
    };
    const sizeParam=request.nextUrl.searchParams.get("pageSize");
    const page=sizeParam?await queryPage(adminDb,query,{collection:"faltas",size:Math.min(100,Math.max(1,Number(sizeParam)||50)),cursor:request.nextUrl.searchParams.get("cursor"),scope:{actor:actor.uid,unidad:scopedUnidadId??null,personalId:personalId??null,scope:scope??null,articulo:articulo??null,inciso:inciso??null,fechaInicio:fechaInicio??null,fechaFin:fechaFin??null,reincidencia:reincidencia??null,estado:estado??null,q:textFilter},matches}):{docs:(await query.get()).docs,nextCursor:null};
    const annotated = await annotateSanctions(adminDb, page.docs.map(d=>({...d.data(),id:d.id})));
    const rows: Array<Record<string, unknown> & { id: string }> = annotated.map((item) => {
        return {
        ...item,
        habilitacionAntecedentes: item.habilitacionAntecedentes ? {
          politica: item.habilitacionAntecedentes.politica,
          rechazosExpresos: (item.habilitacionAntecedentes.rechazosExpresos ?? []).map((r: {antecedenteId:string;solicitudId:string;resueltaEl:string}) => ({antecedenteId:r.antecedenteId,solicitudId:r.solicitudId,resueltaEl:r.resueltaEl})),
        } : null,
        puedeSolicitarCancelacion: canRequestCancellation(actor, item, Date.now()),
        puedeCancelarDirectamente: item.estado === "registrada" && (actor.role === "super_admin" || (actor.role === "admin_dpto" && authorUid(item) === actor.uid && cancellationDeadline(item) !== null && Date.now() < cancellationDeadline(item)!)),
        unidadSancionNombre: item.unidadSancionNombre ?? item.unidadNombre ?? null,
        reincidenciaOrigen: serializeReincidenciaOrigen(item.reincidenciaOrigen),
        fechaSancion: item.fechaSancion?.toDate?.()?.toISOString()?.slice(0, 10) ?? null,
        createdAt: item.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: item.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    const data = rows.filter((row) => {
        if (articulo && !sameArticulo(safeString(row.articulo), articulo)) return false;
        if (inciso && incisoNumber(safeString(row.inciso)) !== incisoNumber(inciso)) return false;
        if (!textFilter) {
          return true;
        }

        const fullName = String(row.nombreCompleto ?? "").toLowerCase();
        const ci = String(row.ci ?? "").toLowerCase();
        const memo = String(row.memorandum ?? "").toLowerCase();
        return (
          fullName.includes(textFilter) ||
          ci.includes(textFilter) ||
          memo.includes(textFilter)
        );
      });

    return NextResponse.json({ data, nextCursor:page.nextCursor }, { status: 200 });
  } catch (error) {
    console.error("GET /api/faltas failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
      code: (error as { code?: string })?.code ?? null,
    });

    const firestoreCode = (error as { code?: string })?.code;
    if (firestoreCode === "failed-precondition") {
      return NextResponse.json(
        {
          error: "Indice Firestore faltante para listar faltas",
          details: error instanceof Error ? error.message : "unknown_error",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "No se pudo listar faltas" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    const body = await request.json();
    return NextResponse.json(await cancelDirectly(actor, body.payload, body.confirmationId));
  } catch (error) { return operationError(error); }
}
