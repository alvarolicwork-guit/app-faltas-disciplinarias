import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_GLOBAL } from "@/lib/domain/constants";
import { resolveFaltaDeleteRequestSchema } from "@/lib/domain/schemas";
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
    if (!USER_ROLES_GLOBAL.has(actor.role)) {
      return forbidden("Solo admin_dpto y super_admin pueden resolver solicitudes");
    }

    const { id } = await context.params;
    if (!id) return badRequest("solicitudId requerido");

    const body = await request.json();
    const parsed = resolveFaltaDeleteRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const { decision, motivoResolucion } = parsed.data;
    const db = getAdminDb();
    const solicitudRef = db.collection("solicitudes_eliminacion_falta").doc(id);
    const auditRef = db.collection("audit_logs").doc();

    const output = await db.runTransaction(async (tx) => {
      const solicitudSnap = await tx.get(solicitudRef);
      if (!solicitudSnap.exists) throw new Error("REQUEST_NOT_FOUND");

      const solicitud = solicitudSnap.data()!;
      if (solicitud.estado !== "pendiente") throw new Error("REQUEST_ALREADY_RESOLVED");
      if (typeof solicitud.faltaId !== "string" || solicitud.faltaId.trim().length === 0) {
        throw new Error("REQUEST_INVALID_DATA");
      }

      let beforeFalta: FirebaseFirestore.DocumentData | null = null;
      if (decision === "aprobada") {
        const faltaRef = db.collection("faltas").doc(solicitud.faltaId);
        const faltaSnap = await tx.get(faltaRef);
        if (faltaSnap.exists) {
          beforeFalta = faltaSnap.data()!;
        }
      }

      const now = Timestamp.now();
      const resolvedPayload = {
        estado: decision,
        motivoResolucion,
        resolvedAt: now,
        resolvedBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
        },
      };

      tx.update(solicitudRef, resolvedPayload);

      if (decision === "aprobada") {
        const faltaRef = db.collection("faltas").doc(solicitud.faltaId);
        if (beforeFalta && beforeFalta.estado !== "anulada") {
          const anulacion = {
            motivoEliminacion:
              typeof solicitud.motivo === "string" && solicitud.motivo.trim().length > 0
                ? solicitud.motivo
                : "Eliminación por solicitud disciplinaria",
            tipoSolicitud: solicitud.tipoSolicitud ?? null,
            memorandumRepresentacion: solicitud.memorandumRepresentacion ?? null,
            comentarioSolicitud: solicitud.comentario ?? null,
            solicitudId: id,
            motivoResolucion,
            anuladaPor: {
              uid: actor.uid,
              email: actor.email,
              role: actor.role,
            },
            fecha: now,
          };
          tx.update(faltaRef, {
            estado: "anulada",
            anulacion,
            updatedAt: now,
            updatedBy: {
              uid: actor.uid,
              email: actor.email,
              role: actor.role,
            },
          });
        }
      }

      const after = { ...solicitud, ...resolvedPayload };
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "resolve_delete_falta_request",
        entity: "solicitud_eliminacion_falta",
        entityId: id,
        unidadId: solicitud.solicitanteUnidadId ?? null,
        before: solicitud,
        after,
        createdAt: now,
      });

      return { ok: true };
    });

    return NextResponse.json(output, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/faltas/solicitudes/[id]/resolver failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
      code: (error as { code?: string })?.code ?? null,
    });

    if (error instanceof Error) {
      if (error.message === "REQUEST_NOT_FOUND") return badRequest("Solicitud no encontrada");
      if (error.message === "REQUEST_ALREADY_RESOLVED") {
        return badRequest("La solicitud ya fue resuelta");
      }
      if (error.message === "REQUEST_INVALID_DATA") {
        return badRequest("La solicitud tiene datos incompletos y no se puede resolver");
      }
    }
    return NextResponse.json(
      {
        error: "No se pudo resolver la solicitud",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
