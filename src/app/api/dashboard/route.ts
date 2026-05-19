import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_UNIT_SCOPE } from "@/lib/domain/constants";
import { getAdminDb } from "@/lib/firebase/admin";

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

    // Build faltas query
    let faltasQuery = db.collection("faltas").where("estado", "==", "registrada");
    if (scopedUnidadId) {
      faltasQuery = faltasQuery.where("unidadId", "==", scopedUnidadId);
    }

    const faltasSnap = await faltasQuery.get();
    const allFaltas = faltasSnap.docs.map((d) => d.data());

    // Total
    const totalFaltas = allFaltas.length;

    // This month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const faltasMes = allFaltas.filter((f) => {
      const ts = f.fechaSancion;
      if (!ts?.toDate) return false;
      return ts.toDate() >= startOfMonth;
    }).length;

    let reincidenciasQuery = db.collection("reincidencias_bloqueadas").where("estado", "==", "bloqueada");
    if (scopedUnidadId) {
      reincidenciasQuery = reincidenciasQuery.where("unidadIntentoId", "==", scopedUnidadId);
    }
    const reincidenciasSnap = await reincidenciasQuery.orderBy("createdAt", "desc").count().get();
    const reincidenciasBloqueadas = reincidenciasSnap.data().count;

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

    return NextResponse.json({
      totalFaltas,
      faltasMes,
      reincidencias: reincidenciasBloqueadas,
      reincidenciasBloqueadas,
      unidadesActivas,
      porArticulo,
      recientes,
    });
  } catch {
    return NextResponse.json({ error: "Error al obtener dashboard" }, { status: 500 });
  }
}
