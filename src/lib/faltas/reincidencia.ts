import { Timestamp } from "firebase-admin/firestore";

import { REINCIDENCIA_WINDOW_DAYS } from "@/lib/domain/constants";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function parseFechaSancion(fechaSancion: string): Date {
  const date = new Date(`${fechaSancion}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("fechaSancion invalida");
  }

  const normalized = date.toISOString().slice(0, 10);

  if (normalized !== fechaSancion) {
    throw new Error("fechaSancion invalida");
  }

  return date;
}

export function buildReincidenciaWindow(fechaSancion: string): {
  start: Timestamp;
  end: Timestamp;
} {
  const endDate = parseFechaSancion(fechaSancion);

  const startDate = new Date(endDate.getTime() - REINCIDENCIA_WINDOW_DAYS * DAY_IN_MS);

  return {
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
  };
}

export function formatReincidenciaMessage(): string {
  return "No se puede registrar la falta. El funcionario ya tiene una sancion con la misma tipificacion dentro de los ultimos 365 dias. Corresponde sancionar con un articulo superior conforme al regimen disciplinario vigente.";
}
