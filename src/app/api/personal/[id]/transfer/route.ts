import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { canManageTransfers, isUnitScopedRole } from "@/lib/domain/roles";
import { getAdminDb } from "@/lib/firebase/admin";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function forbidden(message = "Permisos insuficientes") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canManageTransfers(actor.role)) {
      return forbidden("No tiene permisos para transferir personal");
    }

    const { id } = await context.params;
    if (!id) return badRequest("personalId requerido");

    if (!actor.unidadId || !actor.unidadNombre) {
      return forbidden("Su usuario no tiene una unidad asignada");
    }

    const body = await request.json();
    const motivoTransferencia = String(body?.motivoTransferencia ?? "").trim();
    const expectedFromUnidadId = String(body?.fromUnidadId ?? "").trim();
    const requestedToUnidadId = String(body?.toUnidadId ?? "").trim();

    if (!motivoTransferencia) {
      return badRequest("motivoTransferencia es requerido");
    }

    const db = getAdminDb();
    const globalTransfer = !isUnitScopedRole(actor.role);
    let targetUnidadId = actor.unidadId!;
    let targetUnidadNombre = actor.unidadNombre!;

    if (globalTransfer) {
      if (!requestedToUnidadId) {
        return badRequest("toUnidadId es requerido para reasignación global");
      }
      const unidadSnap = await db.collection("unidades").doc(requestedToUnidadId).get();
      if (!unidadSnap.exists) {
        return badRequest("Unidad destino no existe");
      }
      const unidadData = unidadSnap.data()!;
      if (String(unidadData.estado ?? "") !== "activa") {
        return badRequest("Unidad destino no está activa");
      }
      targetUnidadId = requestedToUnidadId;
      targetUnidadNombre = String(unidadData.nombre ?? "").trim();
      if (!targetUnidadNombre) {
        return badRequest("Unidad destino no tiene nombre configurado");
      }
    }

    const personalRef = db.collection("personal").doc(id);
    const transferRef = db.collection("transferencias_logs").doc();
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (tx) => {
      const personalSnap = await tx.get(personalRef);
      if (!personalSnap.exists) throw new Error("PERSONAL_NOT_FOUND");

      const personal = personalSnap.data()!;
      const fromUnidadId = String(personal.unidadId ?? "");
      const fromUnidadNombre = String(personal.unidadNombre ?? "");
      const toUnidadId = targetUnidadId;
      const toUnidadNombre = targetUnidadNombre;

      if (fromUnidadId === toUnidadId) {
        throw new Error("ALREADY_IN_UNIT");
      }

      if (isUnitScopedRole(actor.role) && expectedFromUnidadId && expectedFromUnidadId !== fromUnidadId) {
        throw new Error("CONCURRENT_TRANSFER");
      }

      const now = Timestamp.now();
      const before = { ...personal };
      const updates = {
        unidadId: toUnidadId,
        unidadNombre: toUnidadNombre,
        updatedAt: now,
      };

      tx.update(personalRef, updates);

      const transferLog = {
        personalId: id,
        ci: personal.ci ?? null,
        nombreCompleto: personal.nombreCompleto ?? null,
        grado: personal.grado ?? null,
        fromUnidadId,
        fromUnidadNombre,
        toUnidadId,
        toUnidadNombre,
        motivoTransferencia,
        realizadoPor: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
          unidadId: actor.unidadId,
          unidadNombre: actor.unidadNombre,
        },
        createdAt: now,
      };

      tx.set(transferRef, transferLog);
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "transfer_personal",
        entity: "personal",
        entityId: id,
        unidadId: toUnidadId,
        before,
        after: { ...before, ...updates },
        createdAt: now,
      });

      return {
        personalId: id,
        fromUnidadId,
        fromUnidadNombre,
        toUnidadId,
        toUnidadNombre,
      };
    });

    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PERSONAL_NOT_FOUND") {
        return NextResponse.json({ error: "Personal no encontrado" }, { status: 404 });
      }
      if (error.message === "ALREADY_IN_UNIT") {
        return badRequest("El funcionario ya pertenece a su unidad");
      }
      if (error.message === "CONCURRENT_TRANSFER") {
        return NextResponse.json(
          { error: "La unidad del funcionario cambió. Recargue y vuelva a intentar." },
          { status: 409 },
        );
      }
    }
    return NextResponse.json({ error: "Error al transferir personal" }, { status: 500 });
  }
}
