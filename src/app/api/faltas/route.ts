import { DocumentData, Query, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import {
  USER_ROLES_CAN_REGISTER_FALTA,
  USER_ROLES_GLOBAL,
  USER_ROLES_UNIT_SCOPE,
} from "@/lib/domain/constants";
import {
  canEscalateFromArticulo,
  getArticuloBaseForSancionEscalada,
  getSancionSugeridaForFaltaBase,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";
import {
  createFaltaSchema,
  listFaltasSearchSchema,
} from "@/lib/domain/schemas";
import {
  buildReincidenciaWindow,
  formatReincidenciaMessage,
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
    const userIsUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);

    if (!input.personalId || !input.unidadId) {
      return badRequest("personalId y unidadId son requeridos");
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
      const personalSnap = await tx.get(personalRef);

      if (!personalSnap.exists) {
        throw new Error("PERSONAL_NOT_FOUND");
      }

      const personal = personalSnap.data()!;

      if (userIsUnitScoped && personal.unidadId !== actor.unidadId) {
        throw new Error("PERSONAL_OUTSIDE_UNIT");
      }

      const fechaSancion = parseFechaSancion(input.fechaSancion);
      const fechaSancionTs = Timestamp.fromDate(fechaSancion);
      const window = buildReincidenciaWindow(input.fechaSancion);
      const unidadSancionId = safeString(actor.unidadId ?? input.unidadId).trim();
      const unidadSancionNombre = safeString(actor.unidadNombre ?? personal.unidadNombre).trim();
      const isSancionEscalada = isReincidenciaEscalada(input.articulo, input.inciso);

      if (!unidadSancionId || !unidadSancionNombre) {
        throw new Error("UNIDAD_DATA_MISSING");
      }

      if (!personal.ci || !personal.nombreCompleto || !personal.grado) {
        throw new Error("PERSONAL_DATA_INCOMPLETE");
      }

      const personalUnidadId = safeString(personal.unidadId).trim();
      const personalUnidadNombre = safeString(personal.unidadNombre).trim();
      const personalCi = safeString(personal.ci).trim();
      const personalNombreCompleto = safeString(personal.nombreCompleto).trim();
      const personalGrado = safeString(personal.grado).trim();

      if (!personalUnidadId || !personalUnidadNombre || !personalCi || !personalNombreCompleto || !personalGrado) {
        throw new Error("PERSONAL_DATA_INCOMPLETE");
      }

      let reincidenciaOrigen: Record<string, unknown> | null = null;

      if (isSancionEscalada) {
        if (!input.reincidenciaOrigen) {
          throw new Error("REINCIDENCIA_ORIGIN_REQUIRED");
        }

        const articuloBaseEsperado = getArticuloBaseForSancionEscalada(input.articulo, input.inciso);
        if (!articuloBaseEsperado || !sameArticulo(input.reincidenciaOrigen.articuloBase, articuloBaseEsperado)) {
          throw new Error("REINCIDENCIA_ORIGIN_ARTICLE_INVALID");
        }

        const origenRef = adminDb.collection("faltas").doc(input.reincidenciaOrigen.faltaReferenciaId);
        const origenSnap = await tx.get(origenRef);
        if (!origenSnap.exists) {
          throw new Error("REINCIDENCIA_ORIGIN_NOT_FOUND");
        }

        const origen = origenSnap.data()!;
        if (origen.estado !== "registrada") {
          throw new Error("REINCIDENCIA_ORIGIN_INVALID");
        }

        if (origen.personalId !== input.personalId) {
          throw new Error("REINCIDENCIA_ORIGIN_PERSONAL_MISMATCH");
        }

        if (!sameArticulo(safeString(origen.articulo), input.reincidenciaOrigen.articuloBase)) {
          throw new Error("REINCIDENCIA_ORIGIN_ARTICLE_INVALID");
        }

        if (safeString(origen.inciso) !== input.reincidenciaOrigen.incisoBase) {
          throw new Error("REINCIDENCIA_ORIGIN_INCISO_INVALID");
        }

        const origenFecha = origen.fechaSancion as Timestamp | undefined;
        if (!origenFecha || origenFecha.toMillis() < window.start.toMillis() || origenFecha.toMillis() > window.end.toMillis()) {
          throw new Error("REINCIDENCIA_ORIGIN_OUT_OF_WINDOW");
        }

        reincidenciaOrigen = {
          articuloBase: safeString(origen.articulo),
          incisoBase: safeString(origen.inciso),
          faltaReferenciaId: origenSnap.id,
          fechaSancionReferencia: origen.fechaSancion ?? null,
          memorandumReferencia: origen.memorandum ?? null,
          unidadReferenciaNombre: origen.unidadSancionNombre ?? origen.unidadNombre ?? null,
        };
      }

      if (!isSancionEscalada && canEscalateFromArticulo(input.articulo)) {
        const reincidenciaQuery = adminDb
          .collection("faltas")
          .where("personalId", "==", input.personalId)
          .where("articulo", "==", input.articulo)
          .where("inciso", "==", input.inciso)
          .where("estado", "==", "registrada")
          .where("fechaSancion", ">=", window.start)
          .where("fechaSancion", "<=", window.end)
          .orderBy("fechaSancion", "asc")
          .limit(1);

        const reincidenciaSnap = await tx.get(reincidenciaQuery);

        if (!reincidenciaSnap.empty) {
        const previa = reincidenciaSnap.docs[0].data();
        const sancionSugerida = getSancionSugeridaForFaltaBase(input.articulo);
        const referencia = {
          faltaId: reincidenciaSnap.docs[0].id,
          fechaSancion: timestampToIsoDate(previa.fechaSancion),
          memorandum: previa.memorandum,
          unidadNombre: previa.unidadSancionNombre ?? previa.unidadNombre,
        };
        const now = Timestamp.now();
        const blockedPayload = {
          personalId: input.personalId,
          ci: personalCi,
          nombreCompleto: personalNombreCompleto,
          grado: personalGrado,
          unidadIntentoId: unidadSancionId,
          unidadIntentoNombre: unidadSancionNombre,
          unidadEfectivoId: personalUnidadId,
          unidadEfectivoNombre: personalUnidadNombre,
          articuloIntentado: input.articulo,
          incisoIntentado: input.inciso,
          fechaSancionIntentada: fechaSancionTs,
          memorandumIntentado: input.memorandum,
          motivoIntentado: input.motivo,
          faltaReferenciaId: referencia.faltaId,
          fechaSancionReferencia: previa.fechaSancion ?? null,
          memorandumReferencia: previa.memorandum ?? null,
          unidadReferenciaNombre: referencia.unidadNombre ?? null,
          sancionSugerida,
          reincidenciaOrigenPropuesta: {
            articuloBase: input.articulo,
            incisoBase: input.inciso,
            faltaReferenciaId: referencia.faltaId,
          },
          actor: {
            uid: actor.uid,
            email: actor.email,
            role: actor.role,
          },
          estado: "bloqueada",
          motivoBloqueo: "misma_tipificacion_365_dias",
          createdAt: now,
        };

        tx.set(reincidenciaBloqueadaRef, blockedPayload);
        tx.set(auditRef, {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "block_reincidencia",
          entity: "reincidencia_bloqueada",
          entityId: reincidenciaBloqueadaRef.id,
          unidadId: unidadSancionId,
          before: null,
          after: blockedPayload,
          createdAt: now,
        });

        return {
          blocked: true as const,
          reincidenciaBloqueadaId: reincidenciaBloqueadaRef.id,
          sancionSugerida,
          reincidenciaOrigen: {
            articuloBase: input.articulo,
            incisoBase: input.inciso,
            faltaReferenciaId: referencia.faltaId,
            fechaSancionReferencia: referencia.fechaSancion,
            memorandumReferencia: referencia.memorandum,
            unidadReferenciaNombre: referencia.unidadNombre,
          },
          referencia,
        };
      }
      }

      const faltaPayload = {
        personalId: input.personalId,
        unidadId: unidadSancionId,
        unidadNombre: unidadSancionNombre,
        unidadSancionId,
        unidadSancionNombre,
        unidadEfectivoId: personalUnidadId,
        unidadEfectivoNombre: personalUnidadNombre,
        ci: personalCi,
        nombreCompleto: personalNombreCompleto,
        grado: personalGrado,
        articulo: input.articulo,
        inciso: input.inciso,
        fechaSancion: fechaSancionTs,
        memorandum: input.memorandum,
        motivo: input.motivo,
        tipoRegistro: isSancionEscalada ? "reincidencia_escalada" : "falta_directa",
        reincidencia: isSancionEscalada,
        reincidenciaReferencia: reincidenciaOrigen,
        reincidenciaOrigen,
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
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "create_falta",
        entity: "falta",
        entityId: faltaRef.id,
        unidadId: unidadSancionId,
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
          message: formatReincidenciaMessage(),
          reincidenciaBloqueadaId: result.reincidenciaBloqueadaId,
          sancionSugerida: result.sancionSugerida,
          reincidenciaOrigen: result.reincidenciaOrigen,
          referencia: result.referencia,
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
    const scopedUnidadId = userIsUnitScoped && !personalId ? actor.unidadId : unidadId;

    if (personalId) {
      query = query.where("personalId", "==", personalId);
    }

    if (scopedUnidadId) {
      query = query.where("unidadId", "==", scopedUnidadId);
    }

    if (articulo) {
      query = query.where("articulo", "==", articulo);
    }

    if (inciso) {
      query = query.where("inciso", "==", inciso);
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

    query = query.orderBy("fechaSancion", "desc").limit(100);

    const snap = await query.get();
    const textFilter = q?.trim().toLowerCase() ?? "";

    const rows: Array<Record<string, unknown> & { id: string }> = snap.docs.map((doc) => {
        const item = doc.data();
        return {
          id: doc.id,
        ...item,
        unidadSancionNombre: item.unidadSancionNombre ?? item.unidadNombre ?? null,
        reincidenciaOrigen: item.reincidenciaOrigen
          ? {
              ...item.reincidenciaOrigen,
              fechaSancionReferencia: item.reincidenciaOrigen.fechaSancionReferencia?.toDate?.()?.toISOString?.()?.slice(0, 10)
                ?? item.reincidenciaOrigen.fechaSancionReferencia
                ?? null,
            }
          : null,
        fechaSancion: item.fechaSancion?.toDate?.()?.toISOString()?.slice(0, 10) ?? null,
        createdAt: item.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: item.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    const data = rows.filter((row) => {
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

    return NextResponse.json({ data }, { status: 200 });
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
    if (!USER_ROLES_GLOBAL.has(actor.role)) {
      return forbidden("Solo admin_dpto o super_admin pueden anular sanciones");
    }

    const faltaId = request.nextUrl.searchParams.get("id")?.trim();
    const solicitudId = request.nextUrl.searchParams.get("solicitudId")?.trim();
    const motivoEliminacion = request.nextUrl.searchParams.get("motivo")?.trim();

    if (!faltaId) return badRequest("id de falta requerido");
    if (!motivoEliminacion || motivoEliminacion.length < 6) {
      return badRequest("motivo de anulación requerido (mínimo 6 caracteres)");
    }

    const adminDb = getAdminDb();
    const faltaRef = adminDb.collection("faltas").doc(faltaId);
    const auditRef = adminDb.collection("audit_logs").doc();

    const result = await adminDb.runTransaction(async (tx) => {
      const faltaSnap = await tx.get(faltaRef);
      if (!faltaSnap.exists) throw new Error("FALTA_NOT_FOUND");

      const before = faltaSnap.data()!;
      if (before.estado === "anulada") {
        throw new Error("FALTA_ALREADY_ANULADA");
      }

      const now = Timestamp.now();
      const after = {
        ...before,
        estado: "anulada",
        anulacion: {
          motivoEliminacion,
          solicitudId: solicitudId ?? null,
          anuladaPor: {
            uid: actor.uid,
            email: actor.email,
            role: actor.role,
          },
          fecha: now,
        },
        updatedAt: now,
        updatedBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
        },
      };

      tx.update(faltaRef, {
        estado: "anulada",
        anulacion: after.anulacion,
        updatedAt: now,
        updatedBy: after.updatedBy,
      });

      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "annul_falta",
        entity: "falta",
        entityId: faltaId,
        unidadId: before.unidadId ?? null,
        before,
        after,
        createdAt: now,
      });

      return { ok: true };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FALTA_NOT_FOUND") return badRequest("Falta no encontrada");
      if (error.message === "FALTA_ALREADY_ANULADA") return badRequest("La falta ya está anulada");
    }
    return NextResponse.json({ error: "No se pudo anular la falta" }, { status: 500 });
  }
}
