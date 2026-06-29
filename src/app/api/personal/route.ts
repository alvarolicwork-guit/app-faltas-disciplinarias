import { Query, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import {
  USER_ROLES_CAN_WRITE_PERSONAL,
  USER_ROLES_GLOBAL,
  USER_ROLES_GLOBAL_READ,
  USER_ROLES_UNIT_SCOPE,
} from "@/lib/domain/constants";
import { canManageTransfers } from "@/lib/domain/roles";
import { createPersonalSchema } from "@/lib/domain/schemas";
import { ciKey } from "@/lib/domain/text-normalization";
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

    if (!actor) {
      return unauthorized();
    }

    const adminDb = getAdminDb();
    const search = request.nextUrl.searchParams;
    const q = search.get("q")?.trim().toLowerCase();
    const limitParam = Number(search.get("limit") ?? "30");
    const limit = Number.isNaN(limitParam) ? 30 : Math.min(Math.max(limitParam, 1), 100);
    const unidadIdParam = search.get("unidadId")?.trim();

    const actorIsUnit = USER_ROLES_UNIT_SCOPE.has(actor.role);
    let query: Query = adminDb.collection("personal");

    if (actorIsUnit) {
      query = query.where("unidadId", "==", actor.unidadId);
    } else if (unidadIdParam && USER_ROLES_GLOBAL_READ.has(actor.role)) {
      query = query.where("unidadId", "==", unidadIdParam);
    } else if (!unidadIdParam && !q) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    query = query.limit(q ? 2000 : Math.max(limit, 300));
    const snap = await query.get();

    const rows: Array<{ id: string } & Record<string, unknown>> = snap.docs.map(
      (doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }),
    );

    const filtered = rows.filter((row) => {
        if (!q) {
          return true;
        }

        const name = String(row.nombreCompleto ?? "").toLowerCase();
        const ci = String(row.ci ?? "").toLowerCase();
        return name.includes(q) || ci.includes(q);
      });

    const ordered = filtered.sort((a, b) =>
      String(a.nombreCompleto ?? "").localeCompare(String(b.nombreCompleto ?? ""), "es", {
        sensitivity: "base",
      }),
    );

    const data = ordered.slice(0, limit).map((row) => {
      const isActorUnit = String(row.unidadId ?? "") === actor.unidadId;
      const isUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);

      if (!isUnitScoped || isActorUnit) {
        return {
          ...row,
          transferRequired: false,
          canTransferToMyUnit: false,
          canTransferToAnyUnit: USER_ROLES_GLOBAL.has(actor.role),
        };
      }

      return {
        id: row.id,
        ci: row.ci,
        grado: row.grado,
        nombreCompleto: row.nombreCompleto,
        unidadId: row.unidadId,
        unidadNombre: row.unidadNombre,
        estado: row.estado,
        transferRequired: true,
        canTransferToMyUnit: canManageTransfers(actor.role),
        canTransferToAnyUnit: USER_ROLES_GLOBAL.has(actor.role),
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo listar personal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);

    if (!actor) {
      return unauthorized();
    }

    if (!USER_ROLES_CAN_WRITE_PERSONAL.has(actor.role)) {
      return forbidden("Solo admin_dpto o super_admin pueden crear personal");
    }

    const body = await request.json();
    const parsed = createPersonalSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const input = parsed.data;
    const adminDb = getAdminDb();

    const registryRef = adminDb.collection("ci_registry").doc(ciKey(input.ci));
    const personalRef = adminDb.collection("personal").doc();

    const result = await adminDb.runTransaction(async (tx) => {
      const registrySnap = await tx.get(registryRef);
      if (registrySnap.exists) {
        throw new Error("CI_ALREADY_EXISTS");
      }

      const existingCiSnap = await tx.get(
        adminDb.collection("personal").where("ci", "==", input.ci).limit(1),
      );
      if (!existingCiSnap.empty) {
        throw new Error("CI_ALREADY_EXISTS");
      }

      const fullName = `${input.grado} ${input.nombres} ${input.apellidos}`.trim();
      const now = Timestamp.now();
      const payload = {
        ci: input.ci,
        grado: input.grado,
        nombres: input.nombres,
        apellidos: input.apellidos,
        nombreCompleto: fullName,
        sexo: input.sexo,
        unidadId: input.unidadId,
        unidadNombre: input.unidadNombre,
        estado: input.estado,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(personalRef, payload);
      tx.set(registryRef, {
        ci: input.ci,
        personalId: personalRef.id,
        createdAt: now,
      });
      tx.set(adminDb.collection("audit_logs").doc(), {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "create_personal",
        entity: "personal",
        entityId: personalRef.id,
        unidadId: input.unidadId,
        before: null,
        after: payload,
        createdAt: now,
      });

      return personalRef.id;
    });

    return NextResponse.json({ ok: true, personalId: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CI_ALREADY_EXISTS") {
      return badRequest("Ya existe personal con ese CI en el departamento");
    }
    return NextResponse.json({ error: "No se pudo crear personal" }, { status: 500 });
  }
}
