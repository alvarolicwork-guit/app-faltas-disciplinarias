import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import { ciKey, normalizeCi, normalizePersonName, toTitleCaseEs } from "@/lib/domain/text-normalization";
import { getAdminDb } from "@/lib/firebase/admin";

const REQUIRED_FIELDS = ["ci", "grado", "nombres", "apellidos", "sexo"];

type ImportError = {
  row: number;
  field: string;
  message: string;
  value?: string;
  suggestion?: string;
};

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeSexo(raw: string): "Masculino" | "Femenino" | null {
  const normalized = normalizeComparableText(raw);
  if (normalized === "masculino") return "Masculino";
  if (normalized === "femenino") return "Femenino";
  return null;
}

function normalizeEstado(raw: string): "activo" | "baja" | "comision" | null {
  const normalized = normalizeComparableText(raw);
  if (normalized === "activo") return "activo";
  if (normalized === "baja") return "baja";
  if (normalized === "comision") return "comision";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const canWrite = actor.role === "admin_dpto" || actor.role === "super_admin";
    if (!canWrite) return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });

    const body = await request.json();
    const { unidadId, rows } = body;
    const isGlobalImport = unidadId === "GLOBAL";

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows es requerido" }, { status: 400 });
    }

    if (!isGlobalImport) {
      return NextResponse.json(
        { error: "Solo se permite importación global. Use unidadId=GLOBAL y columna codigo_unidad." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const unidadesSnap = await db.collection("unidades").where("estado", "==", "activa").get();
    const unidadesMap = new Map<string, { id: string; nombre: string }>();
    unidadesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const id = String(data.id ?? doc.id).trim();
      const nombre = toTitleCaseEs(String(data.nombre ?? "").trim());
      if (id) unidadesMap.set(id, { id, nombre });
    });
    const errors: ImportError[] = [];
    let okRows = 0;
    let createdRows = 0;
    let updatedRows = 0;
    const BATCH_SIZE = 400;

    const existingSnap = await db.collection("personal").get();
    const existingByCi = new Map<string, { id: string; data: Record<string, unknown> }>();
    existingSnap.docs.forEach((doc) => {
      const ci = normalizeCi(String(doc.data().ci ?? ""));
      if (ci) existingByCi.set(ci, { id: doc.id, data: doc.data() as Record<string, unknown> });
    });

    const seenInFile = new Set<string>();
    let batch = db.batch();
    let batchCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const targetUnidadId = isGlobalImport
        ? String(row.codigo_unidad ?? row.unidadid ?? row.unidadId ?? "").trim()
        : unidadId;
      const unidadOficial = unidadesMap.get(targetUnidadId);

      // Validate required fields
      let hasError = false;
      for (const field of REQUIRED_FIELDS) {
        if (!row[field]?.trim()) {
          errors.push({ row: rowNum, field, message: `${field} es requerido`, value: String(row[field] ?? "") });
          hasError = true;
        }
      }
      if (hasError) continue;

      if (!targetUnidadId) {
        errors.push({ row: rowNum, field: "codigo_unidad", message: "codigo_unidad es requerido en importacion global", value: "" });
        continue;
      }

      if (!unidadOficial) {
        errors.push({ row: rowNum, field: "codigo_unidad", message: `Unidad no valida: ${targetUnidadId}`, value: targetUnidadId });
        continue;
      }

      if (!unidadOficial.nombre) {
        errors.push({
          row: rowNum,
          field: "codigo_unidad",
          message: `La unidad ${targetUnidadId} no tiene nombre configurado en catálogo`,
          value: targetUnidadId,
        });
        continue;
      }

      const ci = normalizeCi(String(row.ci ?? ""));
      if (!ci) {
        errors.push({ row: rowNum, field: "ci", message: "CI inválido", value: String(row.ci ?? "") });
        continue;
      }

      const ciFileKey = ciKey(ci);
      if (seenInFile.has(ciFileKey)) {
        errors.push({ row: rowNum, field: "ci", message: "CI duplicado dentro del mismo archivo", value: ci });
        continue;
      }
      seenInFile.add(ciFileKey);

      const rawEstado = String(row.estado ?? "").trim();
      const estado = rawEstado ? normalizeEstado(rawEstado) : "activo";
      if (!estado) {
        errors.push({ row: rowNum, field: "estado", message: `Estado inválido: ${rawEstado}`, value: rawEstado, suggestion: "Use activo, baja o comision" });
        continue;
      }

      const rawSexo = String(row.sexo ?? "").trim();
      const sexo = normalizeSexo(rawSexo);
      if (!sexo) {
        errors.push({ row: rowNum, field: "sexo", message: `Sexo inválido: ${rawSexo}`, value: rawSexo, suggestion: "Use Masculino o Femenino" });
        continue;
      }

      const gradoResolution = resolveRangoPolicial(String(row.grado ?? ""));
      if (!gradoResolution.ok) {
        errors.push({
          row: rowNum,
          field: "grado",
          message: "Grado policial no reconocido",
          value: String(row.grado ?? ""),
        });
        continue;
      }
      const grado = gradoResolution.gradoFinal;

      const nombres = normalizePersonName(String(row.nombres ?? ""));
      const apellidos = normalizePersonName(String(row.apellidos ?? ""));
      const fullName = toTitleCaseEs(`${grado} ${nombres} ${apellidos}`);
      const existing = existingByCi.get(ci);
      const ref = existing
        ? db.collection("personal").doc(existing.id)
        : db.collection("personal").doc();

      const payload = {
        ci,
        grado,
        gradoOriginal: String(row.grado ?? "").trim(),
        gradoMetodoResolucion: gradoResolution.metodo,
        nombres,
        apellidos,
        nombreCompleto: fullName,
        sexo,
        unidadId: targetUnidadId,
        unidadNombre: unidadOficial.nombre,
        estado,
        updatedAt: Timestamp.now(),
      };

      if (existing) {
        const before = existing.data;
        batch.update(ref, payload);
        batch.set(db.collection("audit_logs").doc(), {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "update_personal_by_import",
          entity: "personal",
          entityId: existing.id,
          unidadId: targetUnidadId,
          before,
          after: { ...before, ...payload },
          createdAt: Timestamp.now(),
        });
        updatedRows++;
      } else {
        batch.set(ref, { ...payload, createdAt: Timestamp.now() });
        batch.set(db.collection("ci_registry").doc(ciFileKey), {
          ci,
          personalId: ref.id,
          createdAt: Timestamp.now(),
        });
        createdRows++;
      }

      existingByCi.set(ci, { id: ref.id, data: payload as unknown as Record<string, unknown> });
      batchCount++;
      okRows++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Log the import
    const importLogRef = await db.collection("imports_personal").add({
      fileName: "api-import",
      unidadId: isGlobalImport ? "GLOBAL" : unidadId,
      totalRows: rows.length,
      createdRows,
      updatedRows,
      okRows,
      errorRows: errors.length,
      errors,
      createdAt: Timestamp.now(),
      createdBy: { uid: actor.uid, email: actor.email, role: actor.role },
    });

    return NextResponse.json({ totalRows: rows.length, okRows, createdRows, updatedRows, errorRows: errors.length, errors, importId: importLogRef.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error de importación" }, { status: 500 });
  }
}

async function deleteCollectionByBatches(
  db: ReturnType<typeof getAdminDb>,
  collectionName: string,
  batchSize = 300,
): Promise<number> {
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionName).limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < batchSize) break;
  }

  return deleted;
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const canReset = actor.role === "super_admin";
    if (!canReset) {
      return NextResponse.json(
        { error: "Solo super_admin puede ejecutar la eliminación masiva" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const confirmation = String(body?.confirmation ?? "").trim();
    const reason = toTitleCaseEs(String(body?.reason ?? "").trim());
    const scope = String(body?.scope ?? "").trim();

    if (confirmation !== "ELIMINAR TODO") {
      return NextResponse.json(
        { error: "Confirmación inválida. Envíe confirmation='ELIMINAR TODO'" },
        { status: 400 },
      );
    }

    if (scope !== "personal_import_reset") {
      return NextResponse.json(
        { error: "Scope inválido. Envíe scope='personal_import_reset'" },
        { status: 400 },
      );
    }

    if (reason.length < 10) {
      return NextResponse.json(
        { error: "Debe registrar un motivo de al menos 10 caracteres" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    const deletedPersonal = await deleteCollectionByBatches(db, "personal");
    const deletedRegistry = await deleteCollectionByBatches(db, "ci_registry");
    const deletedImports = await deleteCollectionByBatches(db, "imports_personal");

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "reset_personal_import_data",
      entity: "personal",
      entityId: "bulk-delete",
      before: {
        deletedPersonal,
        deletedRegistry,
        deletedImports,
        reason,
        scope,
      },
      after: null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json(
      {
        ok: true,
        deletedPersonal,
        deletedRegistry,
        deletedImports,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo resetear la base" }, { status: 500 });
  }
}
