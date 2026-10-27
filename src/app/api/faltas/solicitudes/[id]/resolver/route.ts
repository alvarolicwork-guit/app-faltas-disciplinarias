import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { resolveCancellationRequest } from "@/lib/server/cancellations";
import { operationError } from "@/lib/server/operations";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json();
    return NextResponse.json(await resolveCancellationRequest(actor, id, { decision: body.decision, motivoResolucion: body.motivoResolucion }, body.confirmationId));
  } catch (error) { return operationError(error); }
}
