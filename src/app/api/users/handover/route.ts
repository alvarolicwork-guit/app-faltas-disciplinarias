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
      await auth.updateUser(incomingUid, {
        displayName: incomingDisplayName || existingAuthUser.displayName || undefined,
        disabled: false,
      });
    } catch {
      if (temporaryPassword.length < 8) {
        return badRequest("La contrasena temporal del entrante es requerida si la cuenta no existe");
      }
      const created = await auth.createUser({
        email: incomingEmail,
        password: temporaryPassword,
        displayName: incomingDisplayName || undefined,
      });
      incomingUid = created.uid;
      incomingWasCreated = true;
    }

    const outgoingCandidates = await db
      .collection("users")
      .where("unidadId", "==", unidadId)
      .where("role", "==", role)
      .where("status", "==", "activo")
      .limit(10)
      .get();

    const outgoingDoc = outgoingCandidates.docs.find((doc) => doc.id !== incomingUid) ?? null;
    const outgoingUid = outgoingDoc?.id ?? null;

    const incomingRef = db.collection("users").doc(incomingUid);
    const outgoingRef = outgoingUid ? db.collection("users").doc(outgoingUid) : null;
    const auditRef = db.collection("audit_logs").doc();
    const now = Timestamp.now();

    const result = await db.runTransaction(async (tx) => {
      const incomingSnap = await tx.get(incomingRef);
      const outgoingSnap = outgoingRef ? await tx.get(outgoingRef) : null;

      const beforeIncoming = incomingSnap.exists ? incomingSnap.data() : null;
      const beforeOutgoing = outgoingSnap?.exists ? outgoingSnap.data() : null;

      const incomingPayload = {
        email: incomingEmail,
        displayName: incomingDisplayName,
        grado: incomingRango.gradoFinal,
        nombres: incomingNombres,
        apellidos: incomingApellidos,
        nombreCompleto: incomingNombreCompleto,
        role,
        unidadId,
        unidadNombre,
        status: "activo",
        isActive: true,
        mustChangePassword: incomingWasCreated ? true : (beforeIncoming?.mustChangePassword ?? false),
        passwordChangedAt: incomingWasCreated ? null : (beforeIncoming?.passwordChangedAt ?? null),
        createdByAdmin: incomingWasCreated ? true : (beforeIncoming?.createdByAdmin ?? false),
        replacedByUid: null,
        replacesUid: outgoingUid,
        blockedAt: null,
        blockedBy: null,
        blockedReason: null,
        lastRoleAssignmentAt: now,
        updatedAt: now,
        createdAt: beforeIncoming?.createdAt ?? now,
      };

      tx.set(incomingRef, incomingPayload, { merge: true });

      let outgoingAfter = null;
      if (outgoingRef && beforeOutgoing) {
        outgoingAfter = {
          ...beforeOutgoing,
          status: "bloqueado",
          isActive: false,
          blockedAt: now,
          blockedBy: {
            uid: actor.uid,
            email: actor.email,
            role: actor.role,
          },
          blockedReason: reason,
          replacedByUid: incomingUid,
          updatedAt: now,
        };
        tx.update(outgoingRef, outgoingAfter);
      }

      tx.set(auditRef, {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "unit_role_handover",
        entity: "user",
        entityId: incomingUid,
        unidadId,
        before: {
          incoming: beforeIncoming,
          outgoing: beforeOutgoing,
        },
        after: {
          incoming: incomingPayload,
          outgoing: outgoingAfter,
        },
        metadata: {
          reason,
          role,
          incomingEmail,
          incomingGrado: incomingRango.gradoFinal,
          incomingNombres,
          incomingApellidos,
          outgoingUid,
          incomingUid,
        },
        createdAt: now,
      });

      return { incomingUid, outgoingUid, auditId: auditRef.id };
    });

    if (result.outgoingUid) {
      await auth.updateUser(result.outgoingUid, { disabled: true });
      await auth.revokeRefreshTokens(result.outgoingUid);
    }

    await auth.updateUser(result.incomingUid, { disabled: false });
    await auth.revokeRefreshTokens(result.incomingUid);

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo ejecutar el relevo de usuario",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
