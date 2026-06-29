import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { isSuperAdmin } from "@/lib/domain/roles";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: importId } = await context.params;

  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isSuperAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Solo super_admin puede revertir una importacion" },
        { status: 403 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const confirmation = safeString(body?.confirmation).trim();
    const reason = safeString(body?.reason).trim();
    if (confirmation !== "REVERTIR IMPORTACION") {
      return NextResponse.json(
        { error: "Confirmacion invalida. Escriba REVERTIR IMPORTACION" },
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
    const importRef = db.collection("imports_sanciones").doc(importId);
    const importSnap = await importRef.get();
    if (!importSnap.exists) {
      return NextResponse.json({ error: "Importacion no encontrada" }, { status: 404 });
    }
    if (importSnap.data()!.status !== "confirmed") {
      return NextResponse.json(
        { error: "Solo puede revertirse una importacion confirmada" },
        { status: 409 },
      );
    }

    const importedSnap = await db.collection("faltas").where("importId", "==", importId).get();
    const importedIds = new Set(importedSnap.docs.map((doc) => doc.id));
    const activeSnap = await db.collection("faltas").where("estado", "==", "registrada").get();
    const dependent = activeSnap.docs.find((doc) => {
      if (safeString(doc.data().importId) === importId) return false;
      const origin = doc.data().reincidenciaOrigen as { faltaReferenciaId?: unknown } | null;
      return importedIds.has(safeString(origin?.faltaReferenciaId));
    });

    if (dependent) {
      return NextResponse.json(
        {
          error: "No se puede revertir: existen sanciones posteriores que dependen de esta importacion",
          dependentFaltaId: dependent.id,
        },
        { status: 409 },
      );
    }

    await db.runTransaction(async (tx) => {
      const latest = await tx.get(importRef);
      if (!latest.exists || latest.data()!.status !== "confirmed") {
        throw new Error("IMPORT_STATE_CHANGED");
      }
      tx.update(importRef, {
        status: "reverting",
        updatedAt: Timestamp.now(),
      });
    });

    const now = Timestamp.now();
    let batch = db.batch();
    let writes = 0;
    let revertedRows = 0;
    for (const doc of importedSnap.docs) {
      const before = doc.data();
      const after = {
        ...before,
        estado: "anulada",
        anuladaPorReversionImportacion: true,
        motivoAnulacionImportacion: reason,
        updatedAt: now,
        updatedBy: { uid: actor.uid, email: actor.email, role: actor.role },
      };
      batch.update(doc.ref, {
        estado: "anulada",
        anuladaPorReversionImportacion: true,
        motivoAnulacionImportacion: reason,
        updatedAt: now,
        updatedBy: after.updatedBy,
      });
      batch.set(db.collection("audit_logs").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "revert_falta_by_historical_import",
        entity: "falta",
        entityId: doc.id,
        importId,
        before,
        after,
        createdAt: now,
      });
      writes += 2;
      revertedRows += 1;

      if (writes >= 400) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }
    if (writes > 0) await batch.commit();

    await importRef.update({
      status: "reverted",
      revertedRows,
      revertReason: reason,
      revertedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      revertedBy: { uid: actor.uid, email: actor.email, role: actor.role },
    });
    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "revert_import_sanciones_historicas",
      entity: "import_sanciones",
      entityId: importId,
      before: { status: "confirmed" },
      after: { status: "reverted", revertedRows, reason },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, importId, status: "reverted", revertedRows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo revertir la importacion";
    console.error(`POST /api/imports/faltas/${importId}/revert failed`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
