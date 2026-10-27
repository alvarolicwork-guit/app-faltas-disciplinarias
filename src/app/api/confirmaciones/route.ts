import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { prepareConfirmation, operationError, OperationError } from "@/lib/server/operations";

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { action, payload, acepta } = await request.json();
    if (acepta !== true || !["registrar_sancion", "cancelar_sancion", "resolver_solicitud"].includes(action)) throw new OperationError("Debe confirmar su intención", 400);
    if (!["admin_unidad", "admin_dpto", "super_admin"].includes(actor.role)) throw new OperationError("Sin permisos", 403);
    return NextResponse.json({ confirmationId: await prepareConfirmation(actor, action, payload) });
  } catch (error) { return operationError(error); }
}
