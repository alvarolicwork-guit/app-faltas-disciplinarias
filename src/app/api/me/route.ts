import { NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/request-user";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json(
    {
      uid: user.uid,
      email: user.email,
      role: user.role,
      unidadId: user.unidadId ?? null,
      unidadNombre: user.unidadNombre ?? null,
      grado: user.grado ?? null,
      nombres: user.nombres ?? null,
      apellidos: user.apellidos ?? null,
      nombreCompleto: user.nombreCompleto ?? null,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    { status: 200 },
  );
}
