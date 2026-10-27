export function normalizePersonalSearch(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

export function matchesPersonalSearch(row: Record<string, unknown>, query: string): boolean {
  const terms = normalizePersonalSearch(query).split(" ").filter(Boolean);
  const text = [row.ci, row.nombreCompleto, row.nombres, row.apellidos, row.grado].map(normalizePersonalSearch).join(" ");
  return terms.every(term => text.includes(term));
}
