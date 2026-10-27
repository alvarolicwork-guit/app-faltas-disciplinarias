import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertCurrentActor, operationError } from "@/lib/server/operations";
import { evaluateInTransaction, publicDecision } from "@/lib/server/recurrence";
import { z } from "zod";

const inputSchema = z.object({ personalId: z.string().regex(/^[\w-]{1,200}$/), articulo: z.string().min(1).max(500), inciso: z.string().min(1).max(2000), fechaSancion: z.string().min(10).max(10) });
export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request);
    if (!actor) return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    if (!["admin_unidad", "admin_dpto", "super_admin"].includes(actor.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Persona, conducta y fecha requeridas" }, { status: 400 });
    const input = parsed.data, db = getAdminDb();
    const result = await db.runTransaction(async tx => {
      await assertCurrentActor(tx, db, actor);
      const evaluation = await evaluateInTransaction(tx, db, input.personalId, input.fechaSancion, input.articulo, input.inciso);
      return publicDecision(evaluation.decision, evaluation.bloqueo, evaluation.decisionVersion);
    });
    return NextResponse.json(result);
  } catch (error) { return operationError(error); }
}
