import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error("Uso: npm run bootstrap:super-admin -- <email>");
  }

  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const user = await auth.getUserByEmail(email);

  await db.collection("users").doc(user.uid).set(
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? "Super Admin",
      role: "super_admin",
      unidadId: null,
      unidadNombre: null,
      status: "activo",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection("audit_logs").add({
    actorUid: user.uid,
    actorEmail: user.email,
    actorRole: "super_admin",
    action: "create_user",
    entity: "usuario",
    entityId: user.uid,
    unidadId: null,
    before: null,
    after: {
      uid: user.uid,
      email: user.email,
      role: "super_admin",
      status: "activo",
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`Super admin listo: ${user.email} (${user.uid})`);
}

main().catch((error) => {
  console.error("Error bootstrap super admin:", error.message);
  process.exit(1);
});
