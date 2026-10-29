import { isReincidenciaEscalada } from "@/lib/domain/disciplinary-recidivism";
import { annotateSanctions, statisticsByConduct } from "@/lib/server/chain-views";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_UNIT_SCOPE } from "@/lib/domain/constants";
import { parseFechaSancion } from "@/lib/faltas/reincidencia";
import { getAdminDb } from "@/lib/firebase/admin";
import { statsCache } from "@/lib/server/stats-cache";
import { boliviaDate } from "@/lib/domain/institutional-date";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const db = getAdminDb();
    const params = request.nextUrl.searchParams;
    const userIsUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);
    const unidadId = userIsUnitScoped ? actor.unidadId : params.get("unidadId")?.trim();
    const fechaInicio = params.get("fechaInicio");
    const fechaFin = params.get("fechaFin");
    const cache=await statsCache(db,{kind:"report",role:actor.role,unit:unidadId??"",fechaInicio,fechaFin,today:boliviaDate()});
    if(cache.hit)return NextResponse.json(cache.hit);

    let query = db.collection("faltas").where("estado", "==", "registrada");

    if (unidadId) query = query.where("unidadId", "==", unidadId);

    if (fechaInicio) {
      query = query.where("fechaSancion", ">=", Timestamp.fromDate(parseFechaSancion(fechaInicio)));
    }

    if (fechaFin) {
      const end = parseFechaSancion(fechaFin);
      end.setUTCHours(23, 59, 59, 999);
      query = query.where("fechaSancion", "<=", Timestamp.fromDate(end));
    }

    query = query.orderBy("fechaSancion", "desc");

    const snap = await query.get();
    const allFaltas = await annotateSanctions(db,snap.docs.map(d=>({...d.data(),id:d.id})));

    const totalFaltas = allFaltas.length;

    let reincidenciasQuery = db.collection("reincidencias_bloqueadas").where("estado", "==", "bloqueada");
    if (unidadId) reincidenciasQuery = reincidenciasQuery.where("unidadIntentoId", "==", unidadId);
    if (fechaInicio) {
      reincidenciasQuery = reincidenciasQuery.where("createdAt", ">=", Timestamp.fromDate(parseFechaSancion(fechaInicio)));
    }
    if (fechaFin) {
      const end = parseFechaSancion(fechaFin);
      end.setUTCHours(23, 59, 59, 999);
      reincidenciasQuery = reincidenciasQuery.where("createdAt", "<=", Timestamp.fromDate(end));
    }
    const reincidenciasSnap = await reincidenciasQuery.orderBy("createdAt", "desc").count().get();
    const reincidenciasBloqueadas = reincidenciasSnap.data().count;

    // By article
    const artMap = new Map<string, number>();
    for (const f of allFaltas) {
      const art = String(f.articulo ?? "");
      const key = art.includes("Art. 9") ? "Art. 9" : art.includes("Art. 10") ? "Art. 10" : art.includes("Art. 11") ? "Art. 11" : art;
      artMap.set(key, (artMap.get(key) ?? 0) + 1);
    }
    const porArticulo = Array.from(artMap.entries()).map(([articulo, count]) => ({ articulo, count }));

    // By unit
    const unitMap = new Map<string, {unidadId:string; unidadNombre:string; count:number}>();
    for (const f of allFaltas) {
      const name = String(f.unidadSancionNombre ?? f.unidadNombre ?? "Desconocida");
      const id = String(f.unidadSancionId ?? f.unidadId ?? "sin_unidad");
      const group = unitMap.get(id) ?? {unidadId:id, unidadNombre:name, count:0};
      group.count++;
      unitMap.set(id, group);
    }
    const unitIds = [...unitMap.keys()].filter(id => id !== "sin_unidad");
    if (unitIds.length) {
      const units = await db.getAll(...unitIds.map(id=>db.collection("unidades").doc(id)));
      for (const unit of units) if (unit.exists) unitMap.get(unit.id)!.unidadNombre = String(unit.data()!.nombre);
    }
    const porUnidad = [...unitMap.values()];

    const periodo = `${fechaInicio ?? "inicio"} — ${fechaFin ?? "hoy"}`;

    const data={
      periodo,
      totalFaltas,
      personasSancionadas:new Set(allFaltas.map(f=>f.personalId)).size,
      reincidencias: reincidenciasBloqueadas,
      reincidenciasBloqueadas,
      sancionesPorReincidencia:allFaltas.filter(f=>isReincidenciaEscalada(String(f.articulo),String(f.inciso))).length,
      personasConReincidencia:new Set(allFaltas.filter(f=>isReincidenciaEscalada(String(f.articulo),String(f.inciso))).map(f=>f.personalId)).size,
      cadenasVencidas:new Set(allFaltas.filter(f=>f.estadoPlazoCadena==="vencida").map(f=>f.cadenaId)).size,
      cadenasRequierenRevision:allFaltas.filter(f=>f.estadoPlazoCadena==="requiere_revision").length,
      porArticulo,
      porConducta:statisticsByConduct(allFaltas),
      porUnidad,
    };
    await cache.save(data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/reportes failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
      code: (error as { code?: string })?.code ?? null,
    });

    const firestoreCode = (error as { code?: string })?.code;
    if (firestoreCode === "failed-precondition") {
      return NextResponse.json(
        {
          error: "Indice Firestore faltante para generar reportes",
          details: error instanceof Error ? error.message : "unknown_error",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
