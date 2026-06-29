import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "read-excel-file/node";

import { getRequestUser } from "@/lib/auth/request-user";
import { isSuperAdmin } from "@/lib/domain/roles";
import {
  applyHistoricalConsistencyChecks,
  buildHistoricalImportKey,
  fileHash,
  HISTORICAL_IMPORT_MAX_BYTES,
  HISTORICAL_IMPORT_MAX_ROWS,
  historicalImportEnabled,
  mapSpreadsheetRows,
  normalizeHistoricalRow,
  parseCsvMatrix,
  type ExistingSanctionLookup,
  type PersonalImportLookup,
  type SpreadsheetCell,
  type UnitImportLookup,
} from "@/lib/imports/historical-sanctions";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

function timestampToIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function timestampToDateOnly(value: unknown): string {
  return timestampToIso(value)?.slice(0, 10) ?? "";
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

async function requireSuperAdmin(request: NextRequest, requireEnabled: boolean) {
  const actor = await getRequestUser(request);
  if (!actor) return { response: unauthorized(), actor: null };
  if (!isSuperAdmin(actor.role)) {
    return {
      response: forbidden("Solo super_admin puede importar sanciones historicas en bloque"),
      actor: null,
    };
  }
  if (requireEnabled && !historicalImportEnabled()) {
    return {
      response: forbidden("La importacion historica en bloque esta desactivada"),
      actor: null,
    };
  }
  return { response: null, actor };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request, false);
    if (auth.response) return auth.response;

    const db = getAdminDb();
    const snap = await db.collection("imports_sanciones")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    return NextResponse.json({
      enabled: historicalImportEnabled(),
      data: snap.docs.map((doc) => {
        const item = doc.data();
        return {
          id: doc.id,
          fileName: item.fileName,
          status: item.status,
          totalRows: item.totalRows ?? 0,
          validRows: item.validRows ?? 0,
          warningRows: item.warningRows ?? 0,
          errorRows: item.errorRows ?? 0,
          duplicateRows: item.duplicateRows ?? 0,
          createdRows: item.createdRows ?? 0,
          createdAt: timestampToIso(item.createdAt),
          confirmedAt: timestampToIso(item.confirmedAt),
          revertedAt: timestampToIso(item.revertedAt),
          revertReason: item.revertReason ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron listar las importaciones" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request, true);
    if (auth.response || !auth.actor) return auth.response;
    const actor = auth.actor;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return badRequest("Debe seleccionar un archivo");
    if (file.size <= 0) return badRequest("El archivo esta vacio");
    if (file.size > HISTORICAL_IMPORT_MAX_BYTES) {
      return badRequest("El archivo supera el limite de 5 MB");
    }

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xlsx") {
      return badRequest("Formato no admitido. Use .xlsx o .csv");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let matrix: SpreadsheetCell[][];
    if (extension === "xlsx") {
      matrix = await readSheet(buffer) as SpreadsheetCell[][];
    } else {
      matrix = parseCsvMatrix(buffer.toString("utf8"));
    }

    const mapped = mapSpreadsheetRows(matrix);
    if (mapped.missingHeaders.length > 0) {
      return badRequest("Faltan columnas obligatorias", mapped.missingHeaders);
    }
    if (mapped.rows.length === 0) return badRequest("El archivo no contiene filas de datos");
    if (mapped.rows.length > HISTORICAL_IMPORT_MAX_ROWS) {
      return badRequest(`El archivo supera el limite de ${HISTORICAL_IMPORT_MAX_ROWS} filas`);
    }

    const db = getAdminDb();
    const [personalSnap, unitsSnap, existingSnap] = await Promise.all([
      db.collection("personal").get(),
      db.collection("unidades").where("estado", "==", "activa").get(),
      db.collection("faltas").where("estado", "==", "registrada").get(),
    ]);

    const personalByCi = new Map<string, PersonalImportLookup>();
    personalSnap.docs.forEach((doc) => {
      const item = doc.data();
      const ci = safeString(item.ci).trim().toUpperCase();
      if (!ci) return;
      personalByCi.set(ci, {
        id: doc.id,
        ci,
        nombreCompleto: safeString(item.nombreCompleto),
        grado: safeString(item.grado),
        nombres: safeString(item.nombres),
        apellidos: safeString(item.apellidos),
        unidadId: safeString(item.unidadId),
        unidadNombre: safeString(item.unidadNombre),
      });
    });

    const unitsById = new Map<string, UnitImportLookup>();
    unitsSnap.docs.forEach((doc) => {
      const item = doc.data();
      const id = safeString(item.id || doc.id).trim();
      if (id) {
        unitsById.set(id, {
          id,
          nombre: safeString(item.nombre),
          estado: safeString(item.estado),
        });
      }
    });

    const existing: ExistingSanctionLookup[] = existingSnap.docs.map((doc) => {
      const item = doc.data();
      const lookup: ExistingSanctionLookup = {
        id: doc.id,
        personalId: safeString(item.personalId),
        ci: safeString(item.ci),
        articulo: safeString(item.articulo),
        inciso: safeString(item.inciso),
        fechaSancion: timestampToDateOnly(item.fechaSancion),
        memorandum: safeString(item.memorandum),
        unidadSancionId: safeString(item.unidadSancionId || item.unidadId),
        estado: safeString(item.estado),
        importKey: safeString(item.importKey) || undefined,
        reincidenciaOrigen: item.reincidenciaOrigen,
      };
      if (!lookup.importKey && lookup.fechaSancion) {
        lookup.importKey = buildHistoricalImportKey(lookup);
      }
      return lookup;
    });

    const previewRows = mapped.rows.map((row) =>
      normalizeHistoricalRow({ row, personalByCi, unitsById }),
    );
    applyHistoricalConsistencyChecks(previewRows, existing);

    const validRows = previewRows.filter((row) => row.status === "valid").length;
    const warningRows = previewRows.filter((row) => row.status === "warning").length;
    const errorRows = previewRows.filter((row) => row.status === "error").length;
    const duplicateRows = previewRows.filter((row) => row.status === "duplicate").length;
    const now = Timestamp.now();
    const hash = fileHash(buffer);
    const importRef = db.collection("imports_sanciones").doc();

    await importRef.set({
      fileName: file.name.slice(0, 180),
      fileHash: hash,
      fileSize: file.size,
      format: extension,
      status: "preview",
      totalRows: previewRows.length,
      validRows,
      warningRows,
      errorRows,
      duplicateRows,
      createdRows: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: {
        uid: actor.uid,
        email: actor.email,
        role: actor.role,
      },
    });

    let batch = db.batch();
    let count = 0;
    for (const row of previewRows) {
      batch.set(importRef.collection("rows").doc(row.rowKey), row);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "preview_import_sanciones_historicas",
      entity: "import_sanciones",
      entityId: importRef.id,
      before: null,
      after: {
        fileName: file.name.slice(0, 180),
        fileHash: hash,
        totalRows: previewRows.length,
        validRows,
        warningRows,
        errorRows,
        duplicateRows,
      },
      createdAt: now,
    });

    return NextResponse.json({
      importId: importRef.id,
      fileName: file.name,
      status: "preview",
      totalRows: previewRows.length,
      validRows,
      warningRows,
      errorRows,
      duplicateRows,
      canConfirm: validRows + warningRows > 0,
      rows: previewRows,
    });
  } catch (error) {
    console.error("POST /api/imports/faltas failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo analizar el archivo" },
      { status: 500 },
    );
  }
}
