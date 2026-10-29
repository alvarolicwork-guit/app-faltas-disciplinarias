import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import {
  USER_ROLES_CAN_WRITE_PERSONAL,
  USER_ROLES_UNIT_SCOPE,
} from "@/lib/domain/constants";
import { createPersonalSchema } from "@/lib/domain/schemas";
import { ciKey } from "@/lib/domain/text-normalization";
import { getAdminDb } from "@/lib/firebase/admin";
import { matchesPersonalSearch } from "@/lib/domain/personal-search";
import { personalIndex } from "@/lib/domain/personal-index";
import { assertCurrentActor, operationError } from "@/lib/server/operations";
import { indexedPersonal } from "@/lib/server/personal-query";

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
    const db = getAdminDb();
    const catalogo = request.nextUrl.searchParams.get("scope") === "catalogo";
    const unitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);
    if (catalogo && actor.role === "operador_unidad") return forbidden();
    const unitId = unitScoped ? actor.unidadId : request.nextUrl.searchParams.get("unidadId");
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Math.min(300, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));
    const indexReady = (await db.collection("access_control").doc("search_index").get()).data()?.version === 1;
    if(indexReady && (catalogo || !unitId)) {
      const result=await indexedPersonal(db,{q,limit,cursor:request.nextUrl.searchParams.get("cursor"),scope:actor.uid+":"+(catalogo?"catalogo":"global"),exactCI:request.nextUrl.searchParams.get("exactCI")});
      return NextResponse.json({...result,data:result.data.map(r=>({id:r.id,ci:r.ci,grado:r.grado,nombres:r.nombres,apellidos:r.apellidos,nombreCompleto:r.nombreCompleto,sexo:r.sexo,estado:r.estado,transferRequired:false}))});
    }
    let people;
    if (!catalogo && unitId) {
      const sanctions = await db.collection("faltas").where("unidadId", "==", unitId).get();
      const ids = [...new Set(sanctions.docs.map(d=>String(d.data().personalId)))];
      people = [];
      for(let i=0;i<ids.length;i+=100) people.push(...await db.getAll(...ids.slice(i,i+100).map(id=>db.collection("personal").doc(id))));
    } else {
      if (unitScoped && !catalogo) return forbidden();
      people = (await db.collection("personal").get()).docs;
    }
    const rows = people.filter(d=>d.exists).map(d=>({ ...d.data(), id: d.id } as Record<string, unknown> & {id:string})).filter(r=>matchesPersonalSearch(r,q)).sort((a,b)=>String(a.nombreCompleto).localeCompare(String(b.nombreCompleto),"es"));
    const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0);
    const data = rows.slice(offset,offset+limit).map(r=>({id:r.id,ci:r.ci,grado:r.grado,nombres:r.nombres,apellidos:r.apellidos,nombreCompleto:r.nombreCompleto,sexo:r.sexo,estado:r.estado,transferRequired:false}));
    return NextResponse.json({data,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null});
  } catch(error) { return operationError(error); }
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
      await assertCurrentActor(tx, adminDb, actor);
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
        estado: input.estado,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(personalRef, { ...payload, ...personalIndex(payload) });
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
        unidadId: null,
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
    return operationError(error);
  }
}
