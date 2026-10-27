import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { expireRequest } from "@/lib/server/cancellations";
import { operationError } from "@/lib/server/operations";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const snap = await getAdminDb().collection("solicitudes_eliminacion_falta").where("estado", "==", "pendiente").get();
    let expired = 0;
    for (const d of snap.docs) if (await expireRequest(d.id)) expired++;
    return NextResponse.json({ scanned: snap.size, expired });
  } catch (error) { return operationError(error); }
}
