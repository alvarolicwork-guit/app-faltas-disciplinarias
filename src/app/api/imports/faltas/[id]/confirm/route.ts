import { randomUUID } from "node:crypto";
import { ChainError } from "@/lib/domain/recurrence-chain";
import { matchesDecision, newChainMetadata, snapshotChain } from "@/lib/domain/recurrence-chain";
import { assertDecisionAvailable, conductForInput, evaluateInTransaction } from "@/lib/server/recurrence";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import {
  isReincidenciaEscalada,
} from "@/lib/domain/disciplinary-recidivism";
import { isSuperAdmin } from "@/lib/domain/roles";
import { createFaltaSchema } from "@/lib/domain/schemas";
import {
  buildHistoricalImportKey,
  historicalImportEnabled,
  type HistoricalSanctionNormalized,
  type HistoricalSanctionPreviewRow,
} from "@/lib/imports/historical-sanctions";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertCurrentActor, payloadHash, OperationError } from "@/lib/server/operations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function timestampToDateOnly(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  return "";
}

function importedFaltaId(importId: string, rowKey: string): string {
  return `import_${importId}_${rowKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: importId } = await context.params;
  const db = getAdminDb();
  let locked = false;
  const processingOwner=randomUUID();
  const leaseDuration=15*60_000;

  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isSuperAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Solo super_admin puede confirmar la importacion" },
        { status: 403 },
      );
    }
    if (!historicalImportEnabled()) {
      return NextResponse.json({ error: "La importacion historica esta desactivada" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== "IMPORTAR SANCIONES") {
      return NextResponse.json(
        { error: "Confirmacion invalida. Escriba IMPORTAR SANCIONES" },
        { status: 400 },
      );
    }

    const importRef = db.collection("imports_sanciones").doc(importId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(importRef);
      if (!snap.exists) throw new Error("IMPORT_NOT_FOUND");
      const item = snap.data()!;
      if (!["preview", "failed", "confirmed", "reverted", "processing"].includes(item.status)) throw new Error("IMPORT_NOT_READY");
      if (item.status === "confirmed") throw new Error("IMPORT_ALREADY_CONFIRMED");
      if (item.status === "reverted") throw new Error("IMPORT_ALREADY_REVERTED");
      if (item.status === "processing" && (!item.processingLeaseUntil?.toMillis || item.processingLeaseUntil.toMillis()>Date.now())) throw new Error("IMPORT_IN_PROGRESS");
      tx.update(importRef, {
        status: "processing",
        processingAt: Timestamp.now(),
        processingOwner, processingLeaseUntil:Timestamp.fromMillis(Date.now()+leaseDuration),
        updatedAt: Timestamp.now(),
      });
    });
    locked = true;

    const rowsSnap = await importRef.collection("rows").orderBy("sourceRow", "asc").get();
    const previewRows = rowsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as HistoricalSanctionPreviewRow),
    }));
    const acceptedRows = previewRows.filter(
      (row) => (row.status === "valid" || row.status === "warning") && row.normalized,
    );
    let skippedRows = previewRows.length - acceptedRows.length;
    if (acceptedRows.length === 0) throw new Error("IMPORT_NO_VALID_ROWS");

    const normalizedRows = acceptedRows.map((row) => row.normalized!);
    if (normalizedRows.some(row => row.originRowKey)) {
      throw new Error("Importe primero las sanciones base. Los antecedentes deben estar habilitados por plazo cumplido o rechazo expreso y sin solicitudes pendientes antes de registrar reincidencias.");
    }
    const personalIds = [...new Set(normalizedRows.map((row) => row.personalId))];
    const unitIds = [...new Set(normalizedRows.flatMap((row) => [
      row.unidadSancionId,
      row.unidadEfectivoHistoricaId,
    ]))];
    const [personalDocs, unitDocs, currentFaltasSnap] = await Promise.all([
      db.getAll(...personalIds.map((id) => db.collection("personal").doc(id))),
      db.getAll(...unitIds.map((id) => db.collection("unidades").doc(id))),
      db.collection("faltas").where("estado", "==", "registrada").get(),
    ]);
    const personalMap = new Map(personalDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()!]));
    const unitMap = new Map(unitDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()!]));

    if (personalMap.size !== personalIds.length) throw new Error("PERSONAL_CHANGED");
    if (
      unitMap.size !== unitIds.length ||
      [...unitMap.values()].some((unit) => safeString(unit.estado) !== "activa")
    ) {
      throw new Error("UNIT_CHANGED");
    }

    const currentKeys = new Set<string>();
    currentFaltasSnap.docs.forEach((doc) => {
      const item = doc.data();
      if (safeString(item.importId) === importId) return;
      const key = safeString(item.importKey) || buildHistoricalImportKey({
        ci: safeString(item.ci),
        fechaSancion: timestampToDateOnly(item.fechaSancion),
        articulo: safeString(item.articulo),
        inciso: safeString(item.inciso),
        memorandum: safeString(item.memorandum),
        unidadSancionId: safeString(item.unidadSancionId || item.unidadId),
      });
      currentKeys.add(key);
    });
    const duplicate = normalizedRows.find((row) => currentKeys.has(row.importKey));
    if (duplicate) throw new Error(`DUPLICATE_CREATED_AFTER_PREVIEW:${duplicate.sourceRow}`);

    const importedIdByRowKey = new Map(
      normalizedRows.map((row) => [row.rowKey, importedFaltaId(importId, row.rowKey)]),
    );
    const normalizedByRowKey = new Map(normalizedRows.map((row) => [row.rowKey, row]));
    const existingOriginIds = [...new Set(
      normalizedRows.map((row) => row.originFaltaId).filter(Boolean) as string[],
    )];
    const existingOriginDocs = existingOriginIds.length > 0
      ? await db.getAll(...existingOriginIds.map((id) => db.collection("faltas").doc(id)))
      : [];
    const existingOrigins = new Map(
      existingOriginDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()!]),
    );
    if (existingOrigins.size !== existingOriginIds.length) throw new Error("ORIGIN_CHANGED");

    function originFor(row: HistoricalSanctionNormalized, depth = 0): Record<string, unknown> | null {
      if (!row.isEscalada || depth > 5) return null;

      if (row.originRowKey) {
        const origin = normalizedByRowKey.get(row.originRowKey);
        const originId = importedIdByRowKey.get(row.originRowKey);
        if (!origin || !originId) throw new Error(`ORIGIN_CHANGED:${row.sourceRow}`);
        return {
          articuloBase: origin.articulo,
          incisoBase: origin.inciso,
          faltaReferenciaId: originId,
          fechaSancionReferencia: Timestamp.fromDate(new Date(`${origin.fechaSancion}T00:00:00.000Z`)),
          memorandumReferencia: origin.memorandum,
          unidadReferenciaNombre: origin.unidadSancionNombre,
          origenReincidenciaPrevia: originFor(origin, depth + 1),
        };
      }

      if (row.originFaltaId) {
        const origin = existingOrigins.get(row.originFaltaId);
        if (!origin || safeString(origin.estado) !== "registrada") {
          throw new Error(`ORIGIN_CHANGED:${row.sourceRow}`);
        }
        return {
          articuloBase: safeString(origin.articulo),
          incisoBase: safeString(origin.inciso),
          faltaReferenciaId: row.originFaltaId,
          fechaSancionReferencia: origin.fechaSancion ?? null,
          memorandumReferencia: origin.memorandum ?? null,
          unidadReferenciaNombre: origin.unidadSancionNombre ?? origin.unidadNombre ?? null,
          origenReincidenciaPrevia: origin.reincidenciaOrigen ?? null,
        };
      }

      throw new Error(`ORIGIN_CHANGED:${row.sourceRow}`);
    }

    const now = Timestamp.now();
    let createdRows = 0;

    for (const row of normalizedRows) {
      const personal = personalMap.get(row.personalId)!;
      const sanctionUnit = unitMap.get(row.unidadSancionId)!;
      const reincidenciaOrigen = originFor(row);
      const schemaResult = createFaltaSchema.safeParse({
        personalId: row.personalId,
        unidadId: row.unidadSancionId,
        articulo: row.articulo,
        inciso: row.inciso,
        fechaSancion: row.fechaSancion,
        memorandum: row.memorandum,
        motivo: row.motivo,
        modoRegistro: "historico",
        unidadEfectivoHistoricaId: row.unidadEfectivoHistoricaId,
        reincidenciaOrigen: reincidenciaOrigen
          ? {
              articuloBase: safeString(reincidenciaOrigen.articuloBase),
              incisoBase: safeString(reincidenciaOrigen.incisoBase),
              faltaReferenciaId: safeString(reincidenciaOrigen.faltaReferenciaId),
            }
          : null,
      });
      if (!schemaResult.success) {
        throw new Error(`ROW_REVALIDATION_FAILED:${row.sourceRow}:${schemaResult.error.message}`);
      }

      const faltaId = importedIdByRowKey.get(row.rowKey)!;
      const faltaRef = db.collection("faltas").doc(faltaId);
      const payload = {
        personalId: row.personalId,
        unidadId: row.unidadSancionId,
        unidadNombre: safeString(sanctionUnit.nombre),
        unidadSancionId: row.unidadSancionId,
        unidadSancionNombre: safeString(sanctionUnit.nombre),
        unidadEfectivoId: null,
        unidadEfectivoNombre: null,
        ci: safeString(personal.ci),
        nombreCompleto: safeString(personal.nombreCompleto),
        grado: safeString(personal.grado),
        articulo: row.articulo,
        inciso: row.inciso,
        fechaSancion: Timestamp.fromDate(new Date(`${row.fechaSancion}T00:00:00.000Z`)),
        memorandum: row.memorandum,
        motivo: row.motivo,
        motivoNoDisponible: row.motivoNoDisponible,
        tipoRegistro: isReincidenciaEscalada(row.articulo, row.inciso)
          ? "reincidencia_escalada"
          : "falta_directa",
        modoRegistro: "historico",
        cargaHistorica: true,
        origenRegistro: "importacion_historica",
        unidadActualEfectivoId: null,
        unidadActualEfectivoNombre: null,
        reincidencia: isReincidenciaEscalada(row.articulo, row.inciso),
        reincidenciaReferencia: reincidenciaOrigen,
        reincidenciaOrigen,
        requiereRemisionDisciplinaria: false,
        remisionMensaje: null,
        estado: "registrada",
        importId,
        importRow: row.sourceRow,
        importKey: row.importKey,
        createdAt: now,
        updatedAt: now,
        createdBy: { uid: actor.uid, email: actor.email, role: actor.role },
        updatedBy: { uid: actor.uid, email: actor.email, role: actor.role },
      };

      const inserted = await db.runTransaction(async tx => {
        await assertCurrentActor(tx, db, actor);
        const lease=(await tx.get(importRef)).data();
        if(lease?.processingOwner!==processingOwner || lease.status!=="processing")throw new Error("IMPORT_STATE_CHANGED");
        const personRef = db.collection("personal").doc(row.personalId);
        await tx.get(personRef);
        const existing = await tx.get(faltaRef);
        if (existing.exists) return false; // Retry must never resurrect an annulled row.
        const duplicate = await tx.get(db.collection("faltas").where("importKey", "==", row.importKey));
        if (!duplicate.empty) return false;
        const personRows = await tx.get(db.collection("faltas").where("personalId", "==", row.personalId));
        const conduct = conductForInput(personRows.docs.map(d => ({...d.data(),id:d.id})), {articulo:row.articulo,inciso:row.inciso,reincidenciaOrigen:row.originFaltaId?{faltaReferenciaId:row.originFaltaId}:null});
        const evaluation = await evaluateInTransaction(tx, db, row.personalId, row.fechaSancion, conduct.articulo, conduct.inciso);
        assertDecisionAvailable(evaluation.bloqueo);
        if (!matchesDecision(row.articulo,row.inciso,row.originFaltaId??null,evaluation.decision)) throw new OperationError("Los antecedentes cambiaron o la tipificación histórica no corresponde a la cadena actual");
        if (row.originFaltaId) {
          const origin = await tx.get(db.collection("faltas").doc(row.originFaltaId));
          if (!origin.exists || payloadHash(origin.data()) !== payloadHash(existingOrigins.get(row.originFaltaId))) throw new OperationError("El antecedente cambió durante la importación");
        }
        const validatedOrigin = snapshotChain(evaluation.decision.nodes);
        const metadata = evaluation.decision.metadata ?? newChainMetadata(faltaId,conduct,row.fechaSancion);
        const effectivePayload = { ...payload,...metadata,habilitacionAntecedentes:evaluation.habilitacionAntecedentes,...(evaluation.skipRegistrationWait?{pruebaLocalSinEspera:true}:{}),reincidenciaOrigen:validatedOrigin,reincidenciaReferencia:validatedOrigin,
          fundamentoOriginal:{...metadata,articulo:row.articulo,inciso:row.inciso,reincidenciaOrigen:validatedOrigin} };
        tx.update(importRef,{processingLeaseUntil:Timestamp.fromMillis(Date.now()+leaseDuration),updatedAt:Timestamp.now()});
        tx.set(personRef, { workflowUpdatedAt: Timestamp.now() }, { merge: true });
        tx.create(faltaRef, { ...effectivePayload, confirmacion: { metodo: "confirmacion_lote", texto: "IMPORTAR SANCIONES", importId, actorUid: actor.uid, fecha: now } });
        tx.set(db.collection("audit_logs").doc(`import_${importId}_${row.rowKey}`), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "create_falta_by_historical_import",
        entity: "falta",
        entityId: faltaId,
        unidadId: row.unidadSancionId,
        importId,
        importRow: row.sourceRow,
        before: null,
        after: effectivePayload,
        createdAt: now,
      });
        return true;
      });
      if (inserted) createdRows += 1; else skippedRows += 1;
    }

    await db.runTransaction(async (tx) => {
      const latest = await tx.get(importRef);
      if (!latest.exists || (latest.data()!.status !== "processing" || latest.data()!.processingOwner !== processingOwner)) {
        throw new Error("IMPORT_STATE_CHANGED");
      }
      tx.update(importRef, {
        status: "confirmed",
        createdRows,
        skippedRows,
        confirmedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        confirmedBy: { uid: actor.uid, email: actor.email, role: actor.role },
        lastError: null,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "confirm_import_sanciones_historicas",
        entity: "import_sanciones",
        entityId: importId,
        before: { status: "processing" },
        after: { status: "confirmed", createdRows, skippedRows },
        createdAt: Timestamp.now(),
      });
    });

    return NextResponse.json({
      ok: true,
      importId,
      status: "confirmed",
      createdRows,
      skippedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo confirmar la importacion";
    console.error(`POST /api/imports/faltas/${importId}/confirm failed`, error);

    if (locked) {
      await db.runTransaction(async tx=>{const ref=db.collection("imports_sanciones").doc(importId);const current=(await tx.get(ref)).data();if(current?.processingOwner===processingOwner)tx.update(ref,{status:"failed",lastError:message.slice(0,500),updatedAt:Timestamp.now()});}).catch(()=>undefined);
    }

    const conflict =
      message.startsWith("IMPORT_") ||
      message.startsWith("DUPLICATE_") ||
      message.startsWith("ORIGIN_") ||
      message.startsWith("PERSONAL_") ||
      message.startsWith("UNIT_");
    return NextResponse.json({ error: message }, { status: error instanceof OperationError ? error.status : error instanceof ChainError || conflict ? 409 : 500 });
  }
}
