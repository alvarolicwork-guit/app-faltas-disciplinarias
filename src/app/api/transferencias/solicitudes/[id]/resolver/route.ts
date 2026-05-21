import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { canManageTransfers, isGlobalRole, isUnitScopedRole } from "@/lib/domain/roles";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canManageTransfers(actor.role)) return forbidden("No tiene permisos para resolver traspasos");

    const { id } = await context.params;
    if (!id) return badRequest("solicitudId requerido");

    const body = await request.json();
    const decision = String(body?.decision ?? "").trim();
    const observacionRespuesta = String(body?.observacionRespuesta ?? "").trim();
    if (decision !== "aceptada" && decision !== "rechazada") {
      return badRequest("decision debe ser aceptada o rechazada");
    }

    const db = getAdminDb();
    const solicitudRef = db.collection("transferencias_solicitudes").doc(id);
    const auditRef = db.collection("audit_logs").doc();
    const transferLogRef = db.collection("transferencias_logs").doc();

    const output = await db.runTransaction(async (tx) => {
      const solicitudSnap = await tx.get(solicitudRef);
      if (!solicitudSnap.exists) throw new Error("REQUEST_NOT_FOUND");
      const solicitud = solicitudSnap.data()!;

      if (solicitud.estado !== "pendiente") throw new Error("REQUEST_ALREADY_RESOLVED");

      const now = Timestamp.now();
      const expiresAt = solicitud.expiresAt as Timestamp | undefined;
      if (!expiresAt || expiresAt.toMillis() <= now.toMillis()) {
        const expiredPayload = {
          estado: "vencida",
          observacionRespuesta: "Rechazo automático por vencimiento de 24 horas",
          respondedAt: now,
          updatedAt: now,
        };
        tx.update(solicitudRef, expiredPayload);
        tx.set(auditRef, {
          actorUid: "system",
          actorEmail: "system",
          actorRole: "system",
          action: "expire_transfer_request",
          entity: "transferencia_solicitud",
          entityId: id,
          unidadId: solicitud.toUnidadId ?? null,
          before: solicitud,
          after: { ...solicitud, ...expiredPayload },
          createdAt: now,
        });
        throw new Error("REQUEST_EXPIRED");
      }

      const canResolve =
        (isUnitScopedRole(actor.role) && actor.unidadId === solicitud.toUnidadId) ||
        isGlobalRole(actor.role);

      if (!canResolve) throw new Error("REQUEST_FOR_OTHER_UNIT");

      const resolvedPayload = {
        estado: decision,
        observacionRespuesta: observacionRespuesta || null,
        respondedBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
          unidadId: actor.unidadId ?? null,
          unidadNombre: actor.unidadNombre ?? null,
        },
        respondedAt: now,
        updatedAt: now,
      };

      let beforePersonal: FirebaseFirestore.DocumentData | null = null;
      let afterPersonal: FirebaseFirestore.DocumentData | null = null;

      if (decision === "aceptada") {
        const personalRef = db.collection("personal").doc(String(solicitud.personalId));
        const personalSnap = await tx.get(personalRef);
        if (!personalSnap.exists) throw new Error("PERSONAL_NOT_FOUND");
        const personal = personalSnap.data()!;
        if (String(personal.unidadId ?? "") !== String(solicitud.fromUnidadId ?? "")) {
          throw new Error("PERSONAL_UNIT_CHANGED");
        }

        beforePersonal = { ...personal };
        const personalUpdates = {
          unidadId: solicitud.toUnidadId,
          unidadNombre: solicitud.toUnidadNombre,
          updatedAt: now,
        };
        afterPersonal = { ...personal, ...personalUpdates };
        tx.update(personalRef, personalUpdates);

        tx.set(transferLogRef, {
          personalId: solicitud.personalId,
          ci: solicitud.ci ?? null,
          nombreCompleto: solicitud.nombreCompleto ?? null,
          grado: solicitud.grado ?? null,
          fromUnidadId: solicitud.fromUnidadId,
          fromUnidadNombre: solicitud.fromUnidadNombre,
          toUnidadId: solicitud.toUnidadId,
          toUnidadNombre: solicitud.toUnidadNombre,
          motivoTransferencia: solicitud.motivoSolicitud,
          solicitudId: id,
          realizadoPor: resolvedPayload.respondedBy,
          requestedBy: solicitud.requestedBy ?? null,
          createdAt: now,
        });
      }

      tx.update(solicitudRef, resolvedPayload);
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: decision === "aceptada" ? "accept_transfer_request" : "reject_transfer_request",
        entity: "transferencia_solicitud",
        entityId: id,
        unidadId: solicitud.toUnidadId ?? null,
        before: solicitud,
        after: { ...solicitud, ...resolvedPayload },
        personalBefore: beforePersonal,
        personalAfter: afterPersonal,
        createdAt: now,
      });

      return { ok: true, estado: decision };
    });

    return NextResponse.json(output, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REQUEST_NOT_FOUND") return badRequest("Solicitud no encontrada");
      if (error.message === "REQUEST_ALREADY_RESOLVED") return badRequest("La solicitud ya fue resuelta");
      if (error.message === "REQUEST_EXPIRED") return badRequest("La solicitud venció y fue rechazada automáticamente");
      if (error.message === "REQUEST_FOR_OTHER_UNIT") return forbidden("Solo la unidad destino puede resolver esta solicitud");
      if (error.message === "PERSONAL_NOT_FOUND") return badRequest("Personal no encontrado");
      if (error.message === "PERSONAL_UNIT_CHANGED") return badRequest("El efectivo ya no pertenece a la unidad origen; recargue la información");
    }
    console.error("PATCH /api/transferencias/solicitudes/[id]/resolver failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "No se pudo resolver la solicitud de traspaso" }, { status: 500 });
  }
}
