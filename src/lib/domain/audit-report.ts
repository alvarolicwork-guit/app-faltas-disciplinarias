export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${(/^[\s\u0000-\u001f\u007f]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
export function boliviaMonth(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
}

export function auditEventLabel(value: unknown): string {
  return ({ registro: "Registro de sanción", sancion_sin_efecto: "Sanción sin efecto", solicitud: "Solicitud", ajuste_reincidencia: "Ajuste de reincidencia" } as Record<string, string>)[String(value)] ?? String(value ?? "");
}

export function auditStateLabel(value: unknown): string {
  return ({ registrada: "Vigente", anulada: "Sin efecto", aprobada: "Aprobada", rechazada: "Rechazada", pendiente: "Pendiente", cerrada_extraordinaria: "Cerrada por cancelación extraordinaria" } as Record<string, string>)[String(value)] ?? String(value ?? "");
}

export function boliviaDateTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Sin fecha verificable";
  return new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz" });
}
