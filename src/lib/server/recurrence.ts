import { Firestore, Transaction } from "firebase-admin/firestore";
import { ancestorBlock } from "@/lib/domain/sanction-policy";
import { canonicalConduct, ChainError, dateOnly, evaluateRecurrence, RecurrenceDecision, resolveChain, SanctionRow, snapshotChain, validateSanctionDate } from "@/lib/domain/recurrence-chain";
import { OperationError, payloadHash } from "./operations";
import { skipLocalRecurrenceWait } from "./local-test-policy";

export async function evaluateInTransaction(tx: Transaction, db: Firestore, personalId: string, date: string, article: string, inciso: string) {
  validateSanctionDate(date);
  const snap = await tx.get(db.collection("faltas").where("personalId", "==", personalId));
  const rows: SanctionRow[] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const decision = evaluateRecurrence(rows, personalId, date, canonicalConduct(article, inciso));
  const requests: Record<string, unknown>[] = [];
  const skipRegistrationWait = skipLocalRecurrenceWait();
  let bloqueo: string | null = null;
  for (const node of decision.nodes) {
    const requestsSnap = await tx.get(db.collection("solicitudes_eliminacion_falta").where("faltaId", "==", node.id));
    const nodeRequests = requestsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    requests.push(...nodeRequests);
    bloqueo ??= ancestorBlock(node, nodeRequests, Date.now(), {skipRegistrationWait});
  }
  const decisionVersion = payloadHash({ rows, requests, date, conducta: decision.conductaOrigen, skipRegistrationWait });
  return { rows, decision, bloqueo, decisionVersion, skipRegistrationWait };
}

export function publicDecision(decision: RecurrenceDecision, bloqueo: string | null, decisionVersion: string) {
  return { tipo: decision.tipo, periodoAnteriorVencido: decision.periodoAnteriorVencido ?? false, conductaOrigen: decision.conductaOrigen, sancion: decision.sancion, antecedenteId: decision.antecedenteId,
    metadata: decision.metadata, reincidenciaOrigen: snapshotChain(decision.nodes.map(row=>({...row,fechaSancion:dateOnly(row.fechaSancion)}))), bloqueo, disponible: !bloqueo && decision.tipo !== "remision", decisionVersion, pruebaLocalSinEspera: skipLocalRecurrenceWait() };
}

export function conductForInput(rows: SanctionRow[], input: { articulo: string; inciso: string; reincidenciaOrigen?: { faltaReferenciaId: string } | null }) {
  if (input.reincidenciaOrigen) return resolveChain(rows, input.reincidenciaOrigen.faltaReferenciaId).metadata.conductaOrigen;
  return canonicalConduct(input.articulo, input.inciso);
}

export function assertDecisionAvailable(bloqueo: string | null) { if (bloqueo) throw new OperationError(bloqueo); }
export function asOperationError(error: unknown): never {
  if (error instanceof ChainError) throw new OperationError(error.message, error.code.startsWith("FECHA") || error.code === "CATALOGO_INVALIDO" ? 400 : 409);
  throw error;
}
