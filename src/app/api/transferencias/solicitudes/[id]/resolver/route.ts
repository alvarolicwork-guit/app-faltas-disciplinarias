import { NextResponse } from "next/server";
export async function PATCH() { return NextResponse.json({ error: "La asignación de policías a unidades fue retirada" }, { status: 410 }); }
