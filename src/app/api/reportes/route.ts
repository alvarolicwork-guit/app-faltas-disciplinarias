import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { USER_ROLES_UNIT_SCOPE } from "@/lib/domain/constants";
import { parseFechaSancion } from "@/lib/faltas/reincidencia";
import { getAdminDb } from "@/lib/firebase/admin";

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
    const allFaltas = snap.docs.map((d) => d.data());

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
    const unitMap = new Map<string, number>();
    for (const f of allFaltas) {
      const name = String(f.unidadSancionNombre ?? f.unidadNombre ?? "Desconocida");
      unitMap.set(name, (unitMap.get(name) ?? 0) + 1);
    }
    const porUnidad = Array.from(unitMap.entries()).map(([unidadNombre, count]) => ({ unidadNombre, count }));

    const periodo = `${fechaInicio ?? "inicio"} — ${fechaFin ?? "hoy"}`;

    return NextResponse.json({
      periodo,
      totalFaltas,
      reincidencias: reincidenciasBloqueadas,
      reincidenciasBloqueadas,
      porArticulo,
      porUnidad,
    });
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
