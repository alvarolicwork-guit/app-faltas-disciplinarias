export function moduleLabel(module: "personal" | "historial" | "solicitudes", role: string, compact = false): string {
  if (module === "personal") return "Personal";
  if (module === "historial") return compact ? "Sanciones" : "Sanciones registradas";
  return role === "super_admin" ? "Cancelaciones" : compact ? "Solicitudes" : "Solicitudes de cancelación";
}
