import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { canBulkImportPersonal } from "@/lib/domain/roles";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import { ciKey, normalizeCi, normalizePersonName } from "@/lib/domain/text-normalization";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertCurrentActor } from "@/lib/server/operations";

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

    if (!canBulkImportPersonal(actor.role)) {
      return NextResponse.json(
        { error: "Solo super_admin puede importar personal por CSV/Excel" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { unidadId, rows } = body;
    const isGlobalImport = unidadId === "GLOBAL";

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows es requerido" }, { status: 400 });
    }

    if (!isGlobalImport) {
      return NextResponse.json(
        { error: "Solo se permite importación global. Use unidadId=GLOBAL." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const errors: ImportError[] = [];
    let okRows = 0;
    let createdRows = 0;
    let updatedRows = 0;

    const existingSnap = await db.collection("personal").get();
    const existingByCi = new Map<string, { id: string; data: Record<string, unknown> }>();
    existingSnap.docs.forEach((doc) => {
      const ci = normalizeCi(String(doc.data().ci ?? ""));
      if (ci) existingByCi.set(ci, { id: doc.id, data: doc.data() as Record<string, unknown> });
    });

    const seenInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      // Validate required fields
      let hasError = false;
      for (const field of REQUIRED_FIELDS) {
        if (!String(row[field] ?? "").trim()) {
          errors.push({ row: rowNum, field, message: `${field} es requerido`, value: String(row[field] ?? "") });
          hasError = true;
        }
      }
      if (hasError) continue;

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
      const fullName = `${grado} ${nombres} ${apellidos}`.trim();
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
        estado,
        updatedAt: Timestamp.now(),
      };

      const created = await db.runTransaction(async tx => {
        await assertCurrentActor(tx, db, actor);
        const registryRef = db.collection("ci_registry").doc(ciFileKey);
        const registry = await tx.get(registryRef);
        const matches = await tx.get(db.collection("personal").where("ci", "==", ci));
        if (matches.size > 1) throw new Error("CI duplicado: requiere revisión del padrón");
        const registeredId = registry.data()?.personalId;
        const target = db.collection("personal").doc(registeredId || matches.docs[0]?.id || ref.id);
        const before = await tx.get(target);
        if (registeredId && !before.exists && !matches.empty) throw new Error("Registro de identidad inconsistente");
        tx.set(target, { ...payload, createdAt: before.data()?.createdAt ?? Timestamp.now() }, { merge: true });
        tx.set(registryRef, { ci, personalId: target.id, createdAt: registry.data()?.createdAt ?? Timestamp.now() });
        tx.set(db.collection("audit_logs").doc(), { actorUid: actor.uid, actorRole: actor.role, action: "import_personal", entity: "personal", entityId: target.id, before: before.data() ?? null, after: payload, createdAt: Timestamp.now() });
        return !before.exists;
      });
      if (created) createdRows++; else updatedRows++;

      existingByCi.set(ci, { id: ref.id, data: payload as unknown as Record<string, unknown> });
      okRows++;
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

export async function DELETE() { return NextResponse.json({ error: "El padrón no puede borrarse: conserva la identidad del historial. Importe para actualizar por CI." }, {status:410}); }
