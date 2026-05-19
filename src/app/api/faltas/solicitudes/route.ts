import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_GLOBAL, USER_ROLES_UNIT_SCOPE } from "@/lib/domain/constants";
import { createFaltaDeleteRequestSchema } from "@/lib/domain/schemas";
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

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();

    const estado = request.nextUrl.searchParams.get("estado")?.trim() ?? "pendiente";
    const db = getAdminDb();
    let query = db.collection("solicitudes_eliminacion_falta").orderBy("createdAt", "desc").limit(120);

    if (estado) query = query.where("estado", "==", estado);
    if (USER_ROLES_UNIT_SCOPE.has(actor.role)) {
      query = query.where("solicitanteUnidadId", "==", actor.unidadId ?? "");
    } else if (!USER_ROLES_GLOBAL.has(actor.role)) {
      return forbidden();
    }

    const snap = await query.get();
    const data = snap.docs.map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        ...row,
        createdAt: row.createdAt?.toDate?.()?.toISOString?.() ?? null,
        resolvedAt: row.resolvedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudieron listar las solicitudes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!USER_ROLES_UNIT_SCOPE.has(actor.role) && !USER_ROLES_GLOBAL.has(actor.role)) {
      return forbidden();
    }

    const body = await request.json();
    const parsed = createFaltaDeleteRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const {
      faltaId,
      motivo,
      tipoSolicitud,
      memorandumRepresentacion,
      comentario,
    } = parsed.data;
    const db = getAdminDb();
    const faltaRef = db.collection("faltas").doc(faltaId);
    const solicitudRef = db.collection("solicitudes_eliminacion_falta").doc();
    const auditRef = db.collection("audit_logs").doc();

    await db.runTransaction(async (tx) => {
      const faltaSnap = await tx.get(faltaRef);
      if (!faltaSnap.exists) throw new Error("FALTA_NOT_FOUND");

      const falta = faltaSnap.data()!;
      if (falta.estado === "anulada") throw new Error("FALTA_ALREADY_ANULADA");

      const existente = await tx.get(
        db
          .collection("solicitudes_eliminacion_falta")
          .where("faltaId", "==", faltaId)
          .where("estado", "==", "pendiente")
          .limit(1),
      );
      if (!existente.empty) throw new Error("REQUEST_ALREADY_EXISTS");

      const payload = {
        faltaId,
        estado: "pendiente",
        motivo,
        tipoSolicitud,
        memorandumRepresentacion: memorandumRepresentacion ?? null,
        comentario: comentario ?? null,
        faltaResumen: {
          ci: falta.ci ?? null,
          nombreCompleto: falta.nombreCompleto ?? null,
          articulo: falta.articulo ?? null,
          memorandum: falta.memorandum ?? null,
          fechaSancion: falta.fechaSancion ?? null,
          unidadId: falta.unidadId ?? null,
          unidadNombre: falta.unidadNombre ?? null,
        },
        solicitanteUnidadId: actor.unidadId ?? "GLOBAL",
        solicitanteUnidadNombre: actor.unidadNombre ?? "GLOBAL",
        solicitadaPor: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
        },
        createdAt: Timestamp.now(),
      };

      tx.set(solicitudRef, payload);
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "request_delete_falta",
        entity: "solicitud_eliminacion_falta",
        entityId: solicitudRef.id,
        unidadId: actor.unidadId ?? null,
        before: null,
        after: payload,
        createdAt: Timestamp.now(),
      });
    });

    return NextResponse.json({ ok: true, solicitudId: solicitudRef.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FALTA_NOT_FOUND") return badRequest("Falta no encontrada");
      if (error.message === "FALTA_ALREADY_ANULADA") return badRequest("La falta ya está anulada");
      if (error.message === "REQUEST_ALREADY_EXISTS") {
        return badRequest("Ya existe una solicitud pendiente para esta falta");
      }
    }
    return NextResponse.json({ error: "No se pudo registrar la solicitud" }, { status: 500 });
  }
}
