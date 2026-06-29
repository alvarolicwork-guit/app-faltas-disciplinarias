export const RANGOS_POLICIALES = [
  "Cnl. MSc. CAD.",
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
  "My. Serv.",
  "Cap. Serv.",
  "Tte. Serv.",
  "Sbtte. Serv.",
  "Sof. Sup. Serv.",
  "Sof. My. Serv.",
  "Sof. 1ro. Serv.",
  "Sof. 2do. Serv.",
  "Sgto. My. Serv.",
  "Sgto. 1ro. Serv.",
  "Sgto. 2do. Serv.",
  "Sgto. Serv.",
] as const;

type RangoOficial = (typeof RANGOS_POLICIALES)[number];

const RANGO_ORDER = new Map<string, number>(
  RANGOS_POLICIALES.map((rango, index) => [rango, index + 1]),
);

function compactRango(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RANGO_ALIAS = new Map<string, RangoOficial>(
  RANGOS_POLICIALES.map((rango) => [compactRango(rango), rango]),
);

const EXTRA_ALIASES: Array<[string, RangoOficial]> = [
  ["cnl msc cad", "Cnl. MSc. CAD."],
  ["coronel msc cad", "Cnl. MSc. CAD."],
  ["tcnl deap", "Tcnl. DEAP."],
  ["teniente coronel deap", "Tcnl. DEAP."],
  ["my", "My."],
  ["mayor", "My."],
  ["cap", "Cap."],
  ["capitan", "Cap."],
  ["tte", "Tte."],
  ["teniente", "Tte."],
  ["sbtte", "Sbtte."],
  ["subteniente", "Sbtte."],
  ["sof sup", "Sof. Sup."],
  ["suboficial superior", "Sof. Sup."],
  ["sof my", "Sof. My."],
  ["suboficial mayor", "Sof. My."],
  ["sof 1ro", "Sof. 1ro."],
  ["suboficial primero", "Sof. 1ro."],
  ["sof 2do", "Sof. 2do."],
  ["suboficial segundo", "Sof. 2do."],
  ["sgto my", "Sgto. My."],
  ["sargento mayor", "Sgto. My."],
  ["sgto 1ro", "Sgto. 1ro."],
  ["sgto primero", "Sgto. 1ro."],
  ["sgto 2do", "Sgto. 2do."],
  ["sgto segundo", "Sgto. 2do."],
  ["sgto", "Sgto."],
  ["sargento", "Sgto."],
  ["my serv", "My. Serv."],
  ["mayor serv", "My. Serv."],
  ["mayor servicios", "My. Serv."],
  ["cap serv", "Cap. Serv."],
  ["capitan serv", "Cap. Serv."],
  ["capitan servicios", "Cap. Serv."],
  ["tte serv", "Tte. Serv."],
  ["teniente serv", "Tte. Serv."],
  ["teniente servicios", "Tte. Serv."],
  ["sbtte serv", "Sbtte. Serv."],
  ["subteniente serv", "Sbtte. Serv."],
  ["subteniente servicios", "Sbtte. Serv."],
  ["sof sup serv", "Sof. Sup. Serv."],
  ["suboficial superior servicios", "Sof. Sup. Serv."],
  ["sof my serv", "Sof. My. Serv."],
  ["suboficial mayor servicios", "Sof. My. Serv."],
  ["sof 1ro serv", "Sof. 1ro. Serv."],
  ["suboficial primero servicios", "Sof. 1ro. Serv."],
  ["sof 2do serv", "Sof. 2do. Serv."],
  ["suboficial segundo servicios", "Sof. 2do. Serv."],
  ["sgto my serv", "Sgto. My. Serv."],
  ["sargento mayor servicios", "Sgto. My. Serv."],
  ["sgto 1ro serv", "Sgto. 1ro. Serv."],
  ["sargento primero servicios", "Sgto. 1ro. Serv."],
  ["sgto 2do serv", "Sgto. 2do. Serv."],
  ["sargento segundo servicios", "Sgto. 2do. Serv."],
  ["sgto serv", "Sgto. Serv."],
  ["sargento servicios", "Sgto. Serv."],
];

EXTRA_ALIASES.forEach(([alias, rango]) => RANGO_ALIAS.set(compactRango(alias), rango));

export function normalizeRangoPolicial(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

  const compact = compactRango(normalized);
  const alias = RANGO_ALIAS.get(compact);
  if (alias) {
    return { ok: true, gradoFinal: alias, metodo: "alias" };
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
