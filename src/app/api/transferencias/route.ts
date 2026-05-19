import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { isGlobalRole } from "@/lib/domain/roles";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!isGlobalRole(actor.role)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "100");
    const limit = Number.isNaN(limitParam) ? 100 : Math.min(Math.max(limitParam, 1), 300);
    const fromUnidadId = request.nextUrl.searchParams.get("fromUnidadId")?.trim();
    const toUnidadId = request.nextUrl.searchParams.get("toUnidadId")?.trim();

    let query = getAdminDb().collection("transferencias_logs").orderBy("createdAt", "desc").limit(limit);
    if (fromUnidadId) query = query.where("fromUnidadId", "==", fromUnidadId);
    if (toUnidadId) query = query.where("toUnidadId", "==", toUnidadId);

    const snap = await query.get();
    const data = snap.docs.map((doc) => {
      const item = doc.data();
      return {
        id: doc.id,
        ...item,
        createdAt: item.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Error al listar transferencias" }, { status: 500 });
  }
}
