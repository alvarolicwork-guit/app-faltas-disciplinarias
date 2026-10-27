import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(actor.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { newPassword } = await request.json();
    if (typeof newPassword !== "string" || newPassword.length < 8) return NextResponse.json({ error: "Contraseña personal requerida (mínimo ocho caracteres)" }, { status: 400 });
    if (Date.now()/1000 - actor.token.auth_time > 300) return NextResponse.json({ error: "Vuelva a autenticarse para cambiar su contraseña" }, { status: 403 });
    await getAdminAuth().updateUser(actor.uid, { password: newPassword });
    const before = userSnap.data();
    const now = Timestamp.now();
    const updates = {
      mustChangePassword: false,
      passwordChangedAt: now,
      updatedAt: now,
    };

    await userRef.update(updates);

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "first_password_change",
      entity: "user",
      entityId: actor.uid,
      before,
      after: { ...before, ...updates },
      createdAt: now,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar el cambio de contrasena" }, { status: 500 });
  }
}
