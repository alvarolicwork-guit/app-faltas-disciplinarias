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
      if (item.status === "confirmed") throw new Error("IMPORT_ALREADY_CONFIRMED");
      if (item.status === "reverted") throw new Error("IMPORT_ALREADY_REVERTED");
      if (item.status === "processing") throw new Error("IMPORT_IN_PROGRESS");
      tx.update(importRef, {
        status: "processing",
        processingAt: Timestamp.now(),
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
    const skippedRows = previewRows.length - acceptedRows.length;
    if (acceptedRows.length === 0) throw new Error("IMPORT_NO_VALID_ROWS");

    const normalizedRows = acceptedRows.map((row) => row.normalized!);
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
    let batch = db.batch();
    let writes = 0;
    let createdRows = 0;

    for (const row of normalizedRows) {
      const personal = personalMap.get(row.personalId)!;
      const sanctionUnit = unitMap.get(row.unidadSancionId)!;
      const historicalUnit = unitMap.get(row.unidadEfectivoHistoricaId)!;
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
        unidadEfectivoId: row.unidadEfectivoHistoricaId,
        unidadEfectivoNombre: safeString(historicalUnit.nombre),
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
        unidadActualEfectivoId: safeString(personal.unidadId),
        unidadActualEfectivoNombre: safeString(personal.unidadNombre),
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

      batch.set(faltaRef, payload);
      batch.set(db.collection("audit_logs").doc(`import_${importId}_${row.rowKey}`), {
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
        after: payload,
        createdAt: now,
      });
      writes += 2;
      createdRows += 1;

      if (writes >= 400) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }
    if (writes > 0) await batch.commit();

    await db.runTransaction(async (tx) => {
      const latest = await tx.get(importRef);
      if (!latest.exists || latest.data()!.status !== "processing") {
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
      await db.collection("imports_sanciones").doc(importId).set({
        status: "failed",
        lastError: message.slice(0, 500),
        updatedAt: Timestamp.now(),
      }, { merge: true }).catch(() => undefined);
    }

    const conflict =
      message.startsWith("IMPORT_") ||
      message.startsWith("DUPLICATE_") ||
      message.startsWith("ORIGIN_") ||
      message.startsWith("PERSONAL_") ||
      message.startsWith("UNIT_");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
