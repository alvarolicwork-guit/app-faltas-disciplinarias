import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return value;
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert({
      projectId: readEnv("FIREBASE_PROJECT_ID"),
      clientEmail: readEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: readEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

async function getIdToken(email, password) {
  const apiKey = readEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`No se pudo obtener idToken: ${error}`);
  }

  const data = await response.json();
  return data.idToken;
}

async function createDemoPersonal() {
  const db = getFirestore(getAdminApp());
  const personalId = "demo-personal-001";
  await db.collection("personal").doc(personalId).set(
    {
      ci: "12345678",
      grado: "Cap.",
      nombres: "Demo",
      apellidos: "Reincidencia",
      nombreCompleto: "Cap. Demo Reincidencia",
      sexo: "Masculino",
      unidadId: "U-001",
      unidadNombre: "Comando Central",
      estado: "activo",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return personalId;
}

function todayIsoDate() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function postFalta(baseUrl, idToken, payload) {
  const response = await fetch(`${baseUrl}/api/faltas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  return { status: response.status, json };
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const baseUrl = process.argv[4] ?? "http://localhost:3001";

  if (!email || !password) {
    throw new Error(
      "Uso: npm run smoke:reincidencia -- <email> <password> [baseUrl]",
    );
  }

  const personalId = await createDemoPersonal();
  const idToken = await getIdToken(email, password);
  const today = todayIsoDate();
  const marker = Date.now();

  const common = {
    personalId,
    unidadId: "U-001",
    articulo: `Art. DEMO-${marker}`,
    inciso: "a",
    fechaSancion: today,
    motivo: "Prueba automatica de control de reincidencia",
  };

  const first = await postFalta(baseUrl, idToken, {
    ...common,
    memorandum: `MEMO-${marker}-1`,
  });

  const second = await postFalta(baseUrl, idToken, {
    ...common,
    memorandum: `MEMO-${marker}-2`,
  });

  console.log("Resultado primera falta:", first.status, first.json);
  console.log("Resultado segunda falta:", second.status, second.json);

  if (first.status === 201 && second.status === 409) {
    console.log("OK: Bloqueo de reincidencia funcionando correctamente.");
    return;
  }

  throw new Error("La prueba no produjo el comportamiento esperado (201 y 409).");
}

main().catch((error) => {
  console.error("Error en smoke test:", error.message);
  process.exit(1);
});
