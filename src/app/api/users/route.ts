import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES } from "@/lib/domain/constants";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import { canCreateUsers, canDeactivateUsers, canViewUsers } from "@/lib/domain/roles";
import { normalizeWhitespace, toTitleCaseEs } from "@/lib/domain/text-normalization";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function forbidden(msg = "Permisos insuficientes") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

const UNIT_ROLES = new Set(["admin_unidad", "operador_unidad"]);
const USER_ROLES_ALLOWED = new Set<string>(USER_ROLES);
const ADMIN_DPTO_ASSIGNABLE_ROLES = new Set(["operador_unidad", "admin_unidad", "admin_dpto"]);

function normalizeStatus(raw: unknown): "activo" | "bloqueado" | "baja" {
  const value = String(raw ?? "activo").trim().toLowerCase();
  if (value === "bloqueado") return "bloqueado";
  if (value === "baja") return "baja";
  return "activo";
}

function buildNombreCompleto(grado: string, nombres: string, apellidos: string): string {
  const parts = [grado, apellidos, nombres].map((value) => normalizeWhitespace(value)).filter(Boolean);
  return parts.join(" ");
}

async function assertUnitRoleAvailability(
  unitId: string,
  role: string,
  excludeUid?: string,
): Promise<{ ok: true } | { ok: false; email: string }> {
  if (!UNIT_ROLES.has(role)) return { ok: true };

  const db = getAdminDb();
  const snap = await db
    .collection("users")
    .where("unidadId", "==", unitId)
    .where("role", "==", role)
    .where("status", "==", "activo")
    .limit(10)
    .get();

  const duplicated = snap.docs.find((doc) => doc.id !== excludeUid);
  if (!duplicated) return { ok: true };

  return { ok: false, email: String(duplicated.data()?.email ?? "sin-email") };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canViewUsers(actor.role)) return forbidden();

    const db = getAdminDb();
    const snap = await db.collection("users").orderBy("email").get();

    const data = snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Error al listar usuarios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canCreateUsers(actor.role)) return forbidden("Solo super_admin puede crear usuarios");

    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const displayName = body?.displayName ? toTitleCaseEs(String(body.displayName)) : "";
    const role = String(body?.role ?? "").trim();
    const unidadId = body?.unidadId ? String(body.unidadId).trim() : null;
    const unidadNombre = body?.unidadNombre ? toTitleCaseEs(String(body.unidadNombre)) : null;
    const gradoRaw = normalizeWhitespace(String(body?.grado ?? ""));
    const nombres = toTitleCaseEs(String(body?.nombres ?? ""));
    const apellidos = toTitleCaseEs(String(body?.apellidos ?? ""));

    if (!email || !password || !role || !gradoRaw || !nombres || !apellidos) {
      return NextResponse.json(
        { error: "email, password, role, grado, nombres y apellidos son requeridos" },
        { status: 400 },
      );
    }

    if (!USER_ROLES_ALLOWED.has(role)) {
      return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
    }

    const rango = resolveRangoPolicial(gradoRaw);
    if (!rango.ok) {
      return NextResponse.json({ error: "Grado policial inválido" }, { status: 400 });
    }

    if (UNIT_ROLES.has(role) && !unidadId) {
      return NextResponse.json({ error: "Los roles de unidad requieren unidadId" }, { status: 400 });
    }

    if (unidadId && UNIT_ROLES.has(role)) {
      const availability = await assertUnitRoleAvailability(unidadId, role);
      if (!availability.ok) {
        return NextResponse.json(
          { error: `Ya existe un ${role} activo en la unidad ${unidadId} (${availability.email})` },
          { status: 409 },
        );
      }
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    });

    const userData = {
      email,
      displayName,
      grado: rango.gradoFinal,
      nombres,
      apellidos,
      nombreCompleto: buildNombreCompleto(rango.gradoFinal, nombres, apellidos),
      role,
      unidadId,
      unidadNombre,
      status: "activo",
      isActive: true,
      mustChangePassword: true,
      passwordChangedAt: null,
      createdByAdmin: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection("users").doc(userRecord.uid).set(userData);

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "create_user",
      entity: "user",
      entityId: userRecord.uid,
      before: null,
      after: userData,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, uid: userRecord.uid }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear usuario";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canViewUsers(actor.role)) return forbidden();

    const uid = request.nextUrl.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid requerido" }, { status: 400 });

    const body = await request.json();
    const db = getAdminDb();

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const before = userSnap.data();
    if (actor.role === "admin_dpto" && before?.role === "super_admin") {
      return forbidden("admin_dpto no puede modificar un super_admin");
    }

    if (actor.role === "admin_dpto" && uid === actor.uid && body.role !== undefined) {
      return forbidden("admin_dpto no puede modificar su propio rol");
    }

    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };

    if (body.role) {
      const requestedRole = String(body.role).trim();
      if (!USER_ROLES_ALLOWED.has(requestedRole)) {
        return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
      }
      if (actor.role === "admin_dpto" && !ADMIN_DPTO_ASSIGNABLE_ROLES.has(requestedRole)) {
        return forbidden("admin_dpto no puede asignar rol super_admin");
      }
      updates.role = requestedRole;
    }
    if (body.unidadId !== undefined) updates.unidadId = normalizeWhitespace(String(body.unidadId || "")) || null;
    if (body.unidadNombre !== undefined) updates.unidadNombre = body.unidadNombre ? toTitleCaseEs(String(body.unidadNombre)) : null;
    if (body.displayName !== undefined) updates.displayName = toTitleCaseEs(String(body.displayName || ""));

    if (body.grado !== undefined) {
      const rango = resolveRangoPolicial(normalizeWhitespace(String(body.grado || "")));
      if (!rango.ok) {
        return NextResponse.json({ error: "Grado policial inválido" }, { status: 400 });
      }
      updates.grado = rango.gradoFinal;
    }
    if (body.nombres !== undefined) updates.nombres = toTitleCaseEs(String(body.nombres || ""));
    if (body.apellidos !== undefined) updates.apellidos = toTitleCaseEs(String(body.apellidos || ""));

    if (actor.role === "admin_dpto" && body.status !== undefined) {
      return forbidden("admin_dpto no puede cambiar el estado de usuarios");
    }

    const nextStatus = body.status ? normalizeStatus(body.status) : normalizeStatus(before?.status);
    updates.status = nextStatus;
    updates.isActive = nextStatus === "activo";

    const nextRole = String(updates.role ?? before?.role ?? "").trim();
    const nextUnit = String(updates.unidadId ?? before?.unidadId ?? "").trim();

    if (UNIT_ROLES.has(nextRole) && !nextUnit) {
      return NextResponse.json({ error: "Los roles de unidad requieren unidadId" }, { status: 400 });
    }

    if (nextStatus === "activo" && nextUnit && UNIT_ROLES.has(nextRole)) {
      const availability = await assertUnitRoleAvailability(nextUnit, nextRole, uid);
      if (!availability.ok) {
        return NextResponse.json(
          { error: `Ya existe un ${nextRole} activo en la unidad ${nextUnit} (${availability.email})` },
          { status: 409 },
        );
      }
    }

    const nextGrado = String(updates.grado ?? before?.grado ?? "").trim();
    const nextNombres = String(updates.nombres ?? before?.nombres ?? "").trim();
    const nextApellidos = String(updates.apellidos ?? before?.apellidos ?? "").trim();
    if (!nextGrado || !nextNombres || !nextApellidos) {
      return NextResponse.json(
        { error: "El usuario debe tener grado, nombres y apellidos para auditoría" },
        { status: 400 },
      );
    }

    updates.nombreCompleto = buildNombreCompleto(nextGrado, nextNombres, nextApellidos);

    await userRef.update(updates);

    const auth = getAdminAuth();
    const shouldDisable = nextStatus !== "activo";
    await auth.updateUser(uid, { disabled: shouldDisable });
    if (shouldDisable) {
      await auth.revokeRefreshTokens(uid);
    }

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "update_user",
      entity: "user",
      entityId: uid,
      before,
      after: { ...before, ...updates },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canDeactivateUsers(actor.role)) {
      return forbidden("Solo super_admin puede dar de baja usuarios");
    }

    const uid = request.nextUrl.searchParams.get("uid")?.trim();
    if (!uid) return NextResponse.json({ error: "uid requerido" }, { status: 400 });
    if (uid === actor.uid) {
      return NextResponse.json(
        { error: "No puede dar de baja su propia cuenta" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = normalizeWhitespace(String(body?.reason ?? ""));
    if (reason.length < 10) {
      return NextResponse.json(
        { error: "Debe registrar un motivo de baja de al menos 10 caracteres" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const before = userSnap.data()!;
    if (normalizeStatus(before.status) === "baja") {
      return NextResponse.json({ error: "El usuario ya se encuentra en baja" }, { status: 400 });
    }

    if (before.role === "super_admin") {
      const superAdminsSnap = await db
        .collection("users")
        .where("role", "==", "super_admin")
        .where("status", "==", "activo")
        .limit(2)
        .get();

      const activeSuperAdmins = superAdminsSnap.docs.filter((doc) => doc.id !== uid);
      if (activeSuperAdmins.length === 0) {
        return NextResponse.json(
          { error: "No se puede dar de baja al ultimo super_admin activo" },
          { status: 400 },
        );
      }
    }

    const now = Timestamp.now();
    const updates = {
      status: "baja",
      isActive: false,
      deletedAt: now,
      deletedBy: {
        uid: actor.uid,
        email: actor.email,
        role: actor.role,
      },
      deleteReason: reason,
      updatedAt: now,
    };

    await userRef.update(updates);

    const auth = getAdminAuth();
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);

    await db.collection("audit_logs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "delete_user_access",
      entity: "user",
      entityId: uid,
      before,
      after: { ...before, ...updates },
      createdAt: now,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo dar de baja el usuario" }, { status: 500 });
  }
}
