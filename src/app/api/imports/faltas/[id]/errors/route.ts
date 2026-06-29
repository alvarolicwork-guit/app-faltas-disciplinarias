import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";
import { isSuperAdmin } from "@/lib/domain/roles";
import type { HistoricalSanctionPreviewRow } from "@/lib/imports/historical-sanctions";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isSuperAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Solo super_admin puede consultar el reporte de importacion" },
        { status: 403 },
      );
    }

    const { id: importId } = await context.params;
    const db = getAdminDb();
    const importRef = db.collection("imports_sanciones").doc(importId);
    const [importSnap, rowsSnap] = await Promise.all([
      importRef.get(),
      importRef.collection("rows").orderBy("sourceRow", "asc").get(),
    ]);
    if (!importSnap.exists) {
      return NextResponse.json({ error: "Importacion no encontrada" }, { status: 404 });
    }

    const rejectedRows = rowsSnap.docs
      .map((doc) => doc.data() as HistoricalSanctionPreviewRow)
      .filter((row) => row.status === "error" || row.status === "duplicate");

    return NextResponse.json({
      importId,
      fileName: importSnap.data()!.fileName,
      status: importSnap.data()!.status,
      rejectedRows: rejectedRows.length,
      rows: rejectedRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar el reporte" },
      { status: 500 },
    );
  }
}
