export const RANGOS_POLICIALES = [
  "Cnl. MSC. CAD.",
  "Tcnl. DEAP.",
  "My.",
  "Cap.",
  "Tte.",
  "Sbtte.",
  "Sof. Sup.",
  "Sof. My.",
  "Sof. 1ro.",
  "Sof. 2do.",
  "Sgto. My.",
  "Sgto. 1ro.",
  "Sgto. 2do.",
  "Sgto.",
] as const;

type RangoOficial = (typeof RANGOS_POLICIALES)[number];

const RANGO_ORDER = new Map<string, number>(
  RANGOS_POLICIALES.map((rango, index) => [rango, index + 1]),
);

const RANGO_ALIAS: Record<string, RangoOficial> = {
  "cnl msc cad": "Cnl. MSC. CAD.",
  "cnl. msc. cad.": "Cnl. MSC. CAD.",
  "tcnl deap": "Tcnl. DEAP.",
  "tcnl. deap.": "Tcnl. DEAP.",
  "my": "My.",
  "my.": "My.",
  "cap": "Cap.",
  "cap.": "Cap.",
  "cap,": "Cap.",
  "tte": "Tte.",
  "tte.": "Tte.",
  "sbtte": "Sbtte.",
  "sbtte.": "Sbtte.",
  "sof sup": "Sof. Sup.",
  "sof. sup.": "Sof. Sup.",
  "sof my": "Sof. My.",
  "sof. my.": "Sof. My.",
  "sof 1ro": "Sof. 1ro.",
  "sof. 1ro.": "Sof. 1ro.",
  "sof 2do": "Sof. 2do.",
  "sof. 2do.": "Sof. 2do.",
  "sgto my": "Sgto. My.",
  "sgto. my.": "Sgto. My.",
  "sgto 1ro": "Sgto. 1ro.",
  "sgto. 1ro.": "Sgto. 1ro.",
  "sgto primero": "Sgto. 1ro.",
  "sgto 2do": "Sgto. 2do.",
  "sgto. 2do.": "Sgto. 2do.",
  "sgto segundo": "Sgto. 2do.",
  "sgto": "Sgto.",
  "sgto.": "Sgto.",
};

function compactRango(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRangoPolicial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "Cap,") return "Cap.";
  return trimmed.replace(/\s+/g, " ");
}

export function resolveRangoPolicial(rawValue: string): {
  ok: boolean;
  gradoFinal: string;
  metodo: "exact" | "alias" | "normalized" | "invalid";
} {
  const normalized = normalizeRangoPolicial(rawValue);
  if (!normalized) {
    return { ok: false, gradoFinal: "", metodo: "invalid" };
  }

  if (RANGOS_POLICIALES.includes(normalized as RangoOficial)) {
    return { ok: true, gradoFinal: normalized, metodo: "exact" };
  }

  const alias = RANGO_ALIAS[compactRango(normalized)] ?? RANGO_ALIAS[normalized.toLowerCase()];
  if (alias) {
    return { ok: true, gradoFinal: alias, metodo: "alias" };
  }

  const compact = compactRango(normalized);
  for (const official of RANGOS_POLICIALES) {
    if (compactRango(official) === compact) {
      return { ok: true, gradoFinal: official, metodo: "normalized" };
    }
  }

  return { ok: false, gradoFinal: normalized, metodo: "invalid" };
}

export function isRangoPolicial(value: string): boolean {
  return resolveRangoPolicial(value).ok;
}

export function getRangoOrder(value: string): number {
  const resolved = resolveRangoPolicial(value);
  if (!resolved.ok) return 999;
  return RANGO_ORDER.get(resolved.gradoFinal) ?? 999;
}
