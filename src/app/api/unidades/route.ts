import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isGlobalRole } from "@/lib/domain/roles";
import { toTitleCaseEs } from "@/lib/domain/text-normalization";

type UnidadRow = {
  id: string;
  nombre?: string;
  estado?: string;
  createdAt: string | null;
  updatedAt: string | null;
  [key: string]: unknown;
};

function forbidden(message = "No autorizado") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function unauthorized(message = "Token invalido o ausente") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message = "Solicitud invalida") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();

    const adminDb = getAdminDb();
    const snap = await adminDb.collection("unidades")
      .where("estado", "==", "activa")
      .get();

    const data: UnidadRow[] = snap.docs
      .map((doc) => {
        const item = doc.data();
        return {
          ...item,
          id: String(item.id ?? doc.id),
          createdAt: item.createdAt?.toDate?.()?.toISOString?.() ?? null,
          updatedAt: item.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        };
      })
      .sort((a, b) => {
        return a.id.localeCompare(b.id);
      });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudieron listar las unidades" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!isGlobalRole(actor.role)) return forbidden();

    const body = await request.json();
    const nombre = toTitleCaseEs(String(body?.nombre ?? ""));
    if (!nombre) {
      return badRequest("Nombre de unidad es requerido");
    }

    const adminDb = getAdminDb();
    
    // Generar nuevo ID (U-XXX)
    // Para simplificar, buscamos el max ID actual
    const snap = await adminDb.collection("unidades").orderBy("id", "desc").limit(1).get();
    let nextIdNumber = 1;
    if (!snap.empty) {
      const lastId = snap.docs[0].data().id as string;
      const match = lastId.match(/U-(\d+)/);
      if (match) {
        nextIdNumber = parseInt(match[1], 10) + 1;
      }
    }
    const newId = `U-${String(nextIdNumber).padStart(3, "0")}`;

    const newUnit = {
      id: newId,
      nombre,
      estado: "activa",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: {
        uid: actor.uid,
        email: actor.email,
        role: actor.role,
      }
    };

    const docRef = adminDb.collection("unidades").doc(newId);
    await docRef.set(newUnit);

    // Audit Log
    await adminDb.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "create_unidad",
      entity: "unidad",
      entityId: newId,
      before: null,
      after: newUnit,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, data: newUnit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error al crear unidad" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!isGlobalRole(actor.role)) return forbidden();

    const body = await request.json();
    if (!body.id || typeof body.id !== "string") return badRequest("ID de unidad requerido");
    const nombre = toTitleCaseEs(String(body?.nombre ?? ""));
    if (!nombre) return badRequest("Nombre de unidad requerido");

    const adminDb = getAdminDb();
    const docRef = adminDb.collection("unidades").doc(body.id);
    const doc = await docRef.get();

    if (!doc.exists) return badRequest("Unidad no encontrada");

    const beforeData = doc.data();
    const afterData = {
      ...beforeData,
      nombre,
      updatedAt: Timestamp.now(),
    };

    await docRef.update({
      nombre,
      updatedAt: Timestamp.now(),
    });

    // Audit Log
    await adminDb.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "update_unidad",
      entity: "unidad",
      entityId: body.id,
      before: beforeData,
      after: afterData,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Error al actualizar unidad" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!isGlobalRole(actor.role)) return forbidden();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return badRequest("ID de unidad requerido");

    const adminDb = getAdminDb();
    const docRef = adminDb.collection("unidades").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return badRequest("Unidad no encontrada");

    // Validar si tiene dependencias
    const faltasSnap = await adminDb.collection("faltas").where("unidadId", "==", id).limit(1).get();
    if (!faltasSnap.empty) {
      return badRequest(`No se puede eliminar la unidad porque tiene faltas registradas. Hay registros asociados.`);
    }

    const personalSnap = await adminDb.collection("personal").where("unidadId", "==", id).limit(1).get();
    if (!personalSnap.empty) {
      return badRequest(`No se puede eliminar la unidad porque tiene personal asignado.`);
    }
    
    const beforeData = doc.data();

    // Soft delete
    await docRef.update({
      estado: "inactiva",
      updatedAt: Timestamp.now(),
    });

    // Audit Log
    await adminDb.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "delete_unidad",
      entity: "unidad",
      entityId: id,
      before: beforeData,
      after: { ...beforeData, estado: "inactiva", updatedAt: Timestamp.now() },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Error al eliminar unidad" }, { status: 500 });
  }
}
