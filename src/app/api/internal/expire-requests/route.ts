import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processExpiredRequests } from "@/lib/server/expire-requests";
import { operationError } from "@/lib/server/operations";
import { verifyGithubCronToken } from "@/lib/server/cron-identity";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const secretValid=!!secret&&received.length===expected.length&&timingSafeEqual(received,expected);
  const authorization=request.headers.get("authorization")??"";
  const oidcValid=!secretValid&&authorization.startsWith("Bearer ")&&await verifyGithubCronToken(authorization.slice(7));
  if (!secretValid&&!oidcValid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await processExpiredRequests());
  } catch (error) { return operationError(error); }
}
