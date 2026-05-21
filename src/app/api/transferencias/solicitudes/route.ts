import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { isUnitScopedRole, canManageTransfers } from "@/lib/domain/roles";
import { getAdminDb } from "@/lib/firebase/admin";

const HOUR_MS = 60 * 60 * 1000;
const TRANSFER_REQUEST_TTL_HOURS = 24;

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function forbidden(message = "Permisos insuficientes") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function toIso(value: unknown): string | null {
  return value && typeof value === "object" && "toDate" in value
    ? (value as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
    : null;
}

async function expirePendingRequests(db: FirebaseFirestore.Firestore, unidadId?: string) {
  const now = Timestamp.now();
  let query: FirebaseFirestore.Query = db
    .collection("transferencias_solicitudes")
    .where("estado", "==", "pendiente")
    .where("expiresAt", "<=", now);

  if (unidadId) {
    query = query.where("toUnidadId", "==", unidadId);
  }

  const snap = await query.limit(50).get();
  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      estado: "vencida",
      observacionRespuesta: "Rechazo automático por vencimiento de 24 horas",
      respondedAt: now,
      updatedAt: now,
    });
    batch.set(db.collection("audit_logs").doc(), {
      actorUid: "system",
      actorEmail: "system",
      actorRole: "system",
      action: "expire_transfer_request",
      entity: "transferencia_solicitud",
      entityId: doc.id,
      unidadId: doc.data().toUnidadId ?? null,
      before: doc.data(),
      after: { ...doc.data(), estado: "vencida" },
      createdAt: now,
    });
  });
  await batch.commit();
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canManageTransfers(actor.role)) return forbidden("No tiene permisos para ver solicitudes de traspaso");

    const db = getAdminDb();
    const scope = request.nextUrl.searchParams.get("scope") ?? "entrantes";
    const estado = request.nextUrl.searchParams.get("estado") ?? "pendiente";
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "80");
    const limit = Number.isNaN(limitParam) ? 80 : Math.min(Math.max(limitParam, 1), 150);

    await expirePendingRequests(db, isUnitScopedRole(actor.role) ? actor.unidadId : undefined);

    let query: FirebaseFirestore.Query = db.collection("transferencias_solicitudes");

    if (isUnitScopedRole(actor.role)) {
      if (!actor.unidadId) return forbidden("Su usuario no tiene una unidad asignada");
      if (scope === "salientes") {
        query = query.where("fromUnidadId", "==", actor.unidadId);
      } else {
        query = query.where("toUnidadId", "==", actor.unidadId);
      }
    } else if (scope === "salientes") {
      const fromUnidadId = request.nextUrl.searchParams.get("fromUnidadId")?.trim();
      if (fromUnidadId) query = query.where("fromUnidadId", "==", fromUnidadId);
    } else if (scope === "entrantes") {
      const toUnidadId = request.nextUrl.searchParams.get("toUnidadId")?.trim();
      if (toUnidadId) query = query.where("toUnidadId", "==", toUnidadId);
    }

    if (estado !== "todas") {
      query = query.where("estado", "==", estado);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    const snap = await query.get();
    const data = snap.docs.map((doc) => {
      const item = doc.data();
      return {
        id: doc.id,
        ...item,
        createdAt: toIso(item.createdAt),
        expiresAt: toIso(item.expiresAt),
        respondedAt: toIso(item.respondedAt),
        updatedAt: toIso(item.updatedAt),
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/transferencias/solicitudes failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
      code: (error as { code?: string })?.code ?? null,
    });
    return NextResponse.json({ error: "No se pudieron listar las solicitudes de traspaso" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canManageTransfers(actor.role)) return forbidden("No tiene permisos para solicitar traspasos");

    const body = await request.json();
    const personalId = String(body?.personalId ?? "").trim();
    const toUnidadId = String(body?.toUnidadId ?? "").trim();
    const motivoSolicitud = String(body?.motivoSolicitud ?? "").trim();

    if (!personalId) return badRequest("personalId requerido");
    if (!toUnidadId) return badRequest("Seleccione la unidad destino");
    if (motivoSolicitud.length < 6) return badRequest("Debe indicar un motivo de al menos 6 caracteres");

    const db = getAdminDb();
    const personalRef = db.collection("personal").doc(personalId);
    const solicitudRef = db.collection("transferencias_solicitudes").doc();
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (tx) => {
      const personalSnap = await tx.get(personalRef);
      if (!personalSnap.exists) throw new Error("PERSONAL_NOT_FOUND");
      const personal = personalSnap.data()!;

      const fromUnidadId = String(personal.unidadId ?? "").trim();
      const fromUnidadNombre = String(personal.unidadNombre ?? "").trim();

      if (!fromUnidadId || !fromUnidadNombre) throw new Error("PERSONAL_UNIT_MISSING");
      if (isUnitScopedRole(actor.role) && actor.unidadId !== fromUnidadId) {
        throw new Error("PERSONAL_OUTSIDE_UNIT");
      }
      if (fromUnidadId === toUnidadId) throw new Error("SAME_UNIT");

      const targetUnidadSnap = await tx.get(db.collection("unidades").doc(toUnidadId));
      if (!targetUnidadSnap.exists) throw new Error("TARGET_UNIT_NOT_FOUND");
      const targetUnidad = targetUnidadSnap.data()!;
      if (String(targetUnidad.estado ?? "") !== "activa") throw new Error("TARGET_UNIT_INACTIVE");

      const pendingSnap = await tx.get(
        db.collection("transferencias_solicitudes")
          .where("personalId", "==", personalId)
          .where("estado", "==", "pendiente")
          .limit(1),
      );
      if (!pendingSnap.empty) throw new Error("PENDING_REQUEST_EXISTS");

      const nowDate = new Date();
      const now = Timestamp.fromDate(nowDate);
      const expiresAt = Timestamp.fromDate(new Date(nowDate.getTime() + TRANSFER_REQUEST_TTL_HOURS * HOUR_MS));
      const payload = {
        personalId,
        ci: personal.ci ?? null,
        nombreCompleto: personal.nombreCompleto ?? null,
        grado: personal.grado ?? null,
        fromUnidadId,
        fromUnidadNombre,
        toUnidadId,
        toUnidadNombre: String(targetUnidad.nombre ?? "").trim(),
        estado: "pendiente",
        motivoSolicitud,
        observacionRespuesta: null,
        requestedBy: {
          uid: actor.uid,
          email: actor.email,
          role: actor.role,
          unidadId: actor.unidadId ?? null,
          unidadNombre: actor.unidadNombre ?? null,
        },
        respondedBy: null,
        createdAt: now,
        expiresAt,
        respondedAt: null,
        updatedAt: now,
      };

      tx.set(solicitudRef, payload);
      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "request_transfer",
        entity: "transferencia_solicitud",
        entityId: solicitudRef.id,
        unidadId: fromUnidadId,
        before: null,
        after: payload,
        createdAt: now,
      });

      return { id: solicitudRef.id };
    });

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PERSONAL_NOT_FOUND") return badRequest("Personal no encontrado");
      if (error.message === "PERSONAL_UNIT_MISSING") return badRequest("El personal no tiene unidad actual configurada");
      if (error.message === "PERSONAL_OUTSIDE_UNIT") return forbidden("Solo puede enviar personal de su unidad");
      if (error.message === "SAME_UNIT") return badRequest("La unidad destino debe ser diferente a la unidad actual");
      if (error.message === "TARGET_UNIT_NOT_FOUND") return badRequest("Unidad destino no encontrada");
      if (error.message === "TARGET_UNIT_INACTIVE") return badRequest("Unidad destino inactiva");
      if (error.message === "PENDING_REQUEST_EXISTS") return badRequest("Este efectivo ya tiene una solicitud de envío pendiente");
    }
    console.error("POST /api/transferencias/solicitudes failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "No se pudo crear la solicitud de traspaso" }, { status: 500 });
  }
}
