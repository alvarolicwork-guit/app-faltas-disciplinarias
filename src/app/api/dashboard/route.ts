import { isReincidenciaEscalada } from "@/lib/domain/disciplinary-recidivism";
import { annotateSanctions, statisticsByConduct } from "@/lib/server/chain-views";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_UNIT_SCOPE } from "@/lib/domain/constants";
import { getAdminDb } from "@/lib/firebase/admin";
import { pendingRequest, requestDeadline } from "@/lib/domain/sanction-policy";
import { boliviaDate, civilMonth } from "@/lib/domain/institutional-date";
import { statsCache } from "@/lib/server/stats-cache";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const db = getAdminDb();
    const userIsUnitScoped = USER_ROLES_UNIT_SCOPE.has(actor.role);
    const unidadIdParam = request.nextUrl.searchParams.get("unidadId")?.trim();
    const scopedUnidadId = userIsUnitScoped ? actor.unidadId : unidadIdParam;
    const cache=await statsCache(db,{kind:"dashboard",role:actor.role,unit:scopedUnidadId??"",today:boliviaDate()});
    if(cache.hit)return NextResponse.json(cache.hit);

    // Build faltas query
    let faltasQuery = db.collection("faltas").where("estado", "==", "registrada");
    if (scopedUnidadId) {
      faltasQuery = faltasQuery.where("unidadId", "==", scopedUnidadId);
    }

    const faltasSnap = await faltasQuery.get();
    const allFaltas = await annotateSanctions(db,faltasSnap.docs.map(d=>({...d.data(),id:d.id})));

    // Total
    const totalFaltas = allFaltas.length;

    // This month
    const month = civilMonth(boliviaDate());
    const faltasMes = allFaltas.filter((f) => {
      const ts = f.fechaSancion;
      if (!ts?.toDate) return false;
      return civilMonth(ts.toDate().toISOString()) === month;
    }).length;

    let reincidenciasQuery = db.collection("reincidencias_bloqueadas").where("estado", "==", "bloqueada");
    if (scopedUnidadId) {
      reincidenciasQuery = reincidenciasQuery.where("unidadIntentoId", "==", scopedUnidadId);
    }
    const reincidenciasSnap = await reincidenciasQuery.orderBy("createdAt", "desc").count().get();
    const reincidenciasBloqueadas = reincidenciasSnap.data().count;

    const canResolveRequests = ["admin_dpto", "super_admin"].includes(actor.role);
    let pendingSummary: { solicitudesCancelacionPendientes: number; proximaSolicitudVenceAt: string | null } | undefined;
    if (canResolveRequests) {
      let requestsQuery = db.collection("solicitudes_eliminacion_falta").where("estado", "==", "pendiente");
      if (scopedUnidadId) requestsQuery = requestsQuery.where("solicitanteUnidadId", "==", scopedUnidadId);
      const requests = await requestsQuery.get();
      const checkedAt = Date.now();
      const pending = requests.docs.map(d => d.data()).filter(row => pendingRequest(row, checkedAt));
      const deadlines = pending.map(requestDeadline).filter((date): date is number => date !== null);
      pendingSummary = { solicitudesCancelacionPendientes: pending.length, proximaSolicitudVenceAt: deadlines.length ? new Date(Math.min(...deadlines)).toISOString() : null };
    }

    // Active Units Count
    const unidadesSnap = await db.collection("unidades").where("estado", "==", "activa").count().get();
    const unidadesActivas = unidadesSnap.data().count;

    // By article
    const artMap = new Map<string, number>();
    for (const f of allFaltas) {
      const art = String(f.articulo ?? "");
      const key = art.includes("Art. 9") ? "Art. 9" : art.includes("Art. 10") ? "Art. 10" : art.includes("Art. 11") ? "Art. 11" : art;
      artMap.set(key, (artMap.get(key) ?? 0) + 1);
    }
    const porArticulo = Array.from(artMap.entries())
      .map(([articulo, count]) => ({ articulo, count }))
      .sort((a, b) => b.count - a.count);

    // Recent (last 10)
    const sorted = [...allFaltas]
      .filter((f) => f.fechaSancion?.toDate)
      .sort((a, b) => b.fechaSancion.toDate().getTime() - a.fechaSancion.toDate().getTime());
    const recientes = sorted.slice(0, 10).map((f, i) => ({
      id: faltasSnap.docs[allFaltas.indexOf(f)]?.id ?? `r-${i}`,
      nombreCompleto: f.nombreCompleto ?? "",
      articulo: f.articulo ?? "",
      fechaSancion: f.fechaSancion?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? "",
      unidadSancionNombre: f.unidadSancionNombre ?? f.unidadNombre ?? "",
    }));

    const data={
      ...pendingSummary,
      totalFaltas,
      personasSancionadas:new Set(allFaltas.map(f=>f.personalId)).size,
      faltasMes,
      reincidencias: reincidenciasBloqueadas,
      reincidenciasBloqueadas,
      sancionesPorReincidencia:allFaltas.filter(f=>isReincidenciaEscalada(String(f.articulo),String(f.inciso))).length,
      personasConReincidencia:new Set(allFaltas.filter(f=>isReincidenciaEscalada(String(f.articulo),String(f.inciso))).map(f=>f.personalId)).size,
      cadenasVencidas:new Set(allFaltas.filter(f=>f.estadoPlazoCadena==="vencida").map(f=>f.cadenaId)).size,
      cadenasRequierenRevision:allFaltas.filter(f=>f.estadoPlazoCadena==="requiere_revision").length,
      unidadesActivas,
      porArticulo,
      porConducta:statisticsByConduct(allFaltas),
      recientes,
    };
    await cache.save(data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error al obtener dashboard" }, { status: 500 });
  }
}
