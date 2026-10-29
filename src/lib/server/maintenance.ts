import type { Firestore, Transaction } from "firebase-admin/firestore";

export class MaintenanceError extends Error {
  readonly status = 503;
  constructor() { super("Mantenimiento de datos en curso. Intente nuevamente en unos minutos."); }
}

/** Read before writing: changing this fence invalidates in-flight transactions. */
export async function assertDataAvailable(tx: Transaction, db: Firestore) {
  const data = (await tx.get(db.collection("access_control").doc("maintenance"))).data();
  if (data?.active === true) throw new MaintenanceError();
  return Number(data?.generation ?? 0);
}
