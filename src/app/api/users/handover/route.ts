import { persistAccess } from "@/lib/server/user-access";
import { OperationError, operationError } from "@/lib/server/operations";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { canHandoverUnitUsers } from "@/lib/domain/roles";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import { normalizeWhitespace, toTitleCaseEs } from "@/lib/domain/text-normalization";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

const UNIT_ROLES = new Set(["admin_unidad", "operador_unidad"]);

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function forbidden(msg = "Permisos insuficientes") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function buildNombreCompleto(grado: string, nombres: string, apellidos: string): string {
  return [grado, apellidos, nombres].map((value) => normalizeWhitespace(value)).filter(Boolean).join(" ");
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return unauthorized();
    if (!canHandoverUnitUsers(actor.role)) return forbidden();

    const body = await request.json();
    const unidadId = normalizeWhitespace(String(body?.unidadId ?? ""));
    const unidadNombre = body?.unidadNombre ? normalizeWhitespace(String(body.unidadNombre)) : null;
    const role = String(body?.role ?? "").trim();
    const incomingEmail = String(body?.incomingEmail ?? "").trim().toLowerCase();
    const incomingDisplayName = body?.incomingDisplayName
      ? toTitleCaseEs(String(body.incomingDisplayName))
      : "";
    const temporaryPassword = String(body?.temporaryPassword ?? "");
    const incomingGradoRaw = normalizeWhitespace(String(body?.incomingGrado ?? ""));
    const incomingNombres = toTitleCaseEs(String(body?.incomingNombres ?? ""));
    const incomingApellidos = toTitleCaseEs(String(body?.incomingApellidos ?? ""));
    const reason = normalizeWhitespace(String(body?.reason ?? ""));

    if (!unidadId || !role || !incomingEmail || !reason || !incomingGradoRaw || !incomingNombres || !incomingApellidos) {
      return badRequest("unidadId, role, incomingEmail, incomingGrado, incomingNombres, incomingApellidos y reason son requeridos");
    }

    if (!UNIT_ROLES.has(role)) {
      return badRequest("Solo se permite relevo para roles de unidad");
    }

    if (reason.length < 10) {
      return badRequest("El motivo del relevo debe tener al menos 10 caracteres");
    }

    const incomingRango = resolveRangoPolicial(incomingGradoRaw);
    if (!incomingRango.ok) {
      return badRequest("Grado policial del entrante inválido");
    }

    const incomingNombreCompleto = buildNombreCompleto(
      incomingRango.gradoFinal,
      incomingNombres,
      incomingApellidos,
    );

    const auth = getAdminAuth();
    const db = getAdminDb();

    let incomingUid: string;
    let incomingWasCreated = false;
    try {
      const existingAuthUser = await auth.getUserByEmail(incomingEmail);
      incomingUid = existingAuthUser.uid;
      const existingProfile = (await db.collection("users").doc(incomingUid).get()).data();
      if (!existingProfile || !UNIT_ROLES.has(existingProfile.role)) return forbidden("El entrante debe tener un perfil de unidad; no se pueden relevar cuentas departamentales");
    } catch (error) {
      if ((error?.constructor && (error as {code?:string}).code) !== "auth/user-not-found") throw error;
      if (temporaryPassword.length < 8) {
        return badRequest("La contrasena temporal del entrante es requerida si la cuenta no existe");
      }
      const created = await auth.createUser({
        email: incomingEmail,
        password: temporaryPassword,
        displayName: incomingDisplayName || undefined,
        disabled: true,
      });
      incomingUid = created.uid;
      incomingWasCreated = true;
      // A failed handover can be retried: the newly created Auth account stays
      // disabled and has a non-operative profile instead of an orphan login.
      await db.collection("users").doc(incomingUid).set({ email: incomingEmail, role, unidadId, unidadNombre, status: "bloqueado", isActive: false, mustChangePassword: true, createdAt: Timestamp.now() });
    }

    const outgoingCandidates = await db
      .collection("users")
      .where("unidadId", "==", unidadId)
      .where("role", "==", role)
      .where("status", "==", "activo")
      .limit(10)
      .get();

    const outgoingDoc = outgoingCandidates.docs.find((doc) => doc.id !== incomingUid) ?? null;
    const previousIncoming = (await db.collection("users").doc(incomingUid).get()).data();
    const outgoingUid = outgoingDoc?.id ?? (previousIncoming?.handoverPending ? previousIncoming.replacesUid ?? null : null);

    const incomingRef = db.collection("users").doc(incomingUid);
    const now = Timestamp.now();

    const beforeIncoming = (await incomingRef.get()).data();
    const incomingPayload = {
      email: incomingEmail, displayName: incomingDisplayName,
      grado: incomingRango.gradoFinal, nombres: incomingNombres, apellidos: incomingApellidos,
      nombreCompleto: incomingNombreCompleto, role, unidadId, unidadNombre,
      status: "relevo_pendiente", isActive: false, handoverPending: true,
      mustChangePassword: incomingWasCreated ? true : (beforeIncoming?.mustChangePassword ?? false),
      replacesUid: outgoingUid, replacedByUid: null, blockedAt: null,
      lastRoleAssignmentAt: now, updatedAt: now, createdAt: beforeIncoming?.createdAt ?? now,
    };
    const saved = await persistAccess(actor, incomingUid, incomingPayload, { create: !beforeIncoming, outgoingUid, reason });
    const result = { incomingUid, outgoingUid, auditId: saved.auditId };

    if (result.outgoingUid) {
      await auth.updateUser(result.outgoingUid, { disabled: true });
      await auth.revokeRefreshTokens(result.outgoingUid);
    }

    await auth.updateUser(result.incomingUid, { disabled: false });
    await auth.revokeRefreshTokens(result.incomingUid);
    await persistAccess(actor, incomingUid, { status: "activo", isActive: true, handoverPending: false, updatedAt: Timestamp.now() });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof OperationError) return operationError(error);
    return NextResponse.json(
      {
        error: "No se pudo ejecutar el relevo de usuario",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
