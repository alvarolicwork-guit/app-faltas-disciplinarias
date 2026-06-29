import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TARGET_COLLECTIONS = [
  "personal",
  "ci_registry",
  "imports_personal",
  "faltas",
  "reincidencias_bloqueadas",
  "solicitudes_eliminacion_falta",
  "transferencias_solicitudes",
  "transferencias_logs",
  "integraciones_sanciones",
];
const PRESERVED_COLLECTIONS = ["users", "unidades", "audit_logs"];
const EXPECTED_PROJECT = "control-disciplinario-comando";

function getArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno ${name}`);
  return value;
}

function initializeAdmin() {
  if (getApps().length > 0) return;
  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  if (projectId !== EXPECTED_PROJECT) throw new Error(`Proyecto Firebase inesperado: ${projectId}`);
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

function serialize(value) {
  if (value && typeof value.toDate === "function") return { __type: "timestamp", value: value.toDate().toISOString() };
  if (value && value.latitude !== undefined && value.longitude !== undefined) return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (value && value.path && value.firestore) return { __type: "reference", path: value.path };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

async function readCollection(db, name, includeDocuments = false) {
  const snap = await db.collection(name).get();
  return {
    name,
    count: snap.size,
    documents: includeDocuments ? snap.docs.map((doc) => ({ id: doc.id, data: serialize(doc.data()) })) : undefined,
  };
}

async function deleteCollection(db, name) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(name).limit(300).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function main() {
  initializeAdmin();
  const db = getFirestore();
  const mode = getArg("mode") || "preview";
  const reason = getArg("reason").trim();
  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  const expectedConfirmation = `LIMPIAR DATOS DE PRUEBA ${projectId}`;

  const preview = [];
  for (const name of TARGET_COLLECTIONS) preview.push(await readCollection(db, name));
  console.log(JSON.stringify({ mode, projectId, targetCollections: preview, preservedCollections: PRESERVED_COLLECTIONS }, null, 2));
  if (mode === "preview") return;
  if (mode !== "execute") throw new Error("Use --mode=preview o --mode=execute");
  if (getArg("confirm") !== expectedConfirmation) throw new Error(`Confirmacion invalida. Use --confirm="${expectedConfirmation}"`);
  if (reason.length < 15) throw new Error("El motivo debe tener al menos 15 caracteres");

  const collections = [];
  for (const name of TARGET_COLLECTIONS) collections.push(await readCollection(db, name, true));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(".data-backups", `pre-produccion-${projectId}-${stamp}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await writeFile(backupPath, JSON.stringify({ schemaVersion: 1, projectId, exportedAt: new Date().toISOString(), reason, collections }, null, 2), "utf8");

  const deleted = {};
  for (const name of TARGET_COLLECTIONS) deleted[name] = await deleteCollection(db, name);
  const remaining = {};
  for (const name of TARGET_COLLECTIONS) remaining[name] = (await db.collection(name).count().get()).data().count;
  if (Object.values(remaining).some((count) => count !== 0)) throw new Error(`Limpieza incompleta: ${JSON.stringify(remaining)}`);

  const auditRef = await db.collection("audit_logs").add({
    action: "production_data_cleanup",
    entity: "system",
    entityId: projectId,
    actorUid: "local-admin-script",
    actorEmail: process.env.CLEANUP_ACTOR_EMAIL ?? "not-provided",
    actorRole: "super_admin",
    reason,
    targetCollections: TARGET_COLLECTIONS,
    preservedCollections: PRESERVED_COLLECTIONS,
    deleted,
    backupFileName: path.basename(backupPath),
    createdAt: Timestamp.now(),
  });
  console.log(JSON.stringify({ ok: true, backupPath, deleted, remaining, auditLogId: auditRef.id }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
