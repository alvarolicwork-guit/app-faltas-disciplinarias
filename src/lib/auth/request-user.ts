import { DecodedIdToken } from "firebase-admin/auth";
import { DocumentData } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

type RequestUser = {
  uid: string;
  email: string;
  role: string;
  unidadId?: string;
  unidadNombre?: string;
  grado?: string;
  nombres?: string;
  apellidos?: string;
  nombreCompleto?: string;
  mustChangePassword?: boolean;
  token: DecodedIdToken;
};

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "").trim();
}

function mapUser(uid: string, token: DecodedIdToken, data: DocumentData): RequestUser {
  return {
    uid,
    email: data.email ?? token.email ?? "sin-email",
    role: data.role,
    unidadId: data.unidadId,
    unidadNombre: data.unidadNombre,
    grado: data.grado,
    nombres: data.nombres,
    apellidos: data.apellidos,
    nombreCompleto: data.nombreCompleto,
    mustChangePassword: Boolean(data.mustChangePassword),
    token,
  };
}

function isUserEnabled(data: DocumentData): boolean {
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "activo";
  const isActive = data.isActive;

  if (typeof isActive === "boolean") {
    return isActive && status === "activo";
  }

  return status === "activo";
}

export async function getRequestUser(request: NextRequest): Promise<RequestUser | null> {
  const idToken = getBearerToken(request);

  if (!idToken) {
    return null;
  }

  const decodedToken = await getAdminAuth().verifyIdToken(idToken);
  const userDoc = await getAdminDb().collection("users").doc(decodedToken.uid).get();

  if (!userDoc.exists) {
    return null;
  }

  const data = userDoc.data()!;
  if (!isUserEnabled(data)) {
    return null;
  }

  return mapUser(decodedToken.uid, decodedToken, data);
}
