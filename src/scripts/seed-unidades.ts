import { getAdminDb } from "@/lib/firebase/admin";
import { POLICE_UNITS } from "@/lib/domain/police-units";
import { Timestamp } from "firebase-admin/firestore";

export async function seedUnidades() {
  const adminDb = getAdminDb();
  const unidadesRef = adminDb.collection("unidades");

  const snapshot = await unidadesRef.get();
  if (!snapshot.empty) {
    console.log("Las unidades ya han sido inicializadas. Saltando seed.");
    return;
  }

  const batch = adminDb.batch();

  POLICE_UNITS.forEach((unit) => {
    const docRef = unidadesRef.doc(unit.id);
    batch.set(docRef, {
      id: unit.id,
      nombre: unit.nombre,
      estado: "activa",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: {
        uid: "system",
        email: "system@localhost",
        role: "super_admin"
      }
    });
  });

  await batch.commit();
  console.log(`Se insertaron exitosamente ${POLICE_UNITS.length} unidades.`);
}
