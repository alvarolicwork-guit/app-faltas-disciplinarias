import { DISCIPLINARY_CATALOG } from "@/lib/domain/disciplinary-catalog";

export type ReincidenciaOrigenInput = {
  articuloBase: string;
  incisoBase: string;
  faltaReferenciaId: string;
};

export type SancionSugerida = {
  articulo: string;
  inciso: string;
  requiereRemisionDisciplinaria?: boolean;
  remisionMensaje?: string;
};

export function articleNumber(value: string): 9 | 10 | 11 | 12 | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("art. 9") || normalized.includes("articulo 9")) return 9;
  if (normalized.includes("art. 10") || normalized.includes("articulo 10")) return 10;
  if (normalized.includes("art. 11") || normalized.includes("articulo 11")) return 11;
  if (normalized.includes("art. 12") || normalized.includes("articulo 12")) return 12;
  return null;
}

export function incisoNumber(value: string): number | null {
  const match = value.trim().match(/^(\d+)\s*[.)]/);
  if (!match) return null;
  return Number(match[1]);
}

export function isReincidenciaEscalada(articulo: string, inciso: string): boolean {
  const art = articleNumber(articulo);
  const inc = incisoNumber(inciso);
  return (art === 10 || art === 11 || art === 12) && inc === 1;
}

export function isRegimenDisciplinarioReferral(articulo: string, inciso: string): boolean {
  return articleNumber(articulo) === 12 && incisoNumber(inciso) === 1;
}

export function getArticulosBaseForSancionEscalada(articulo: string, inciso: string): string[] {
  if (!isReincidenciaEscalada(articulo, inciso)) return [];

  const art = articleNumber(articulo);
  if (art === 10) return [getArticleLabel(9)];
  if (art === 11) return [getArticleLabel(10), getArticleLabel(9)];
  if (art === 12) return [getArticleLabel(11)];
  return [];
}

export function getArticuloBaseForSancionEscalada(articulo: string, inciso: string): string | null {
  return getArticulosBaseForSancionEscalada(articulo, inciso)[0] ?? null;
}

export function getSancionSugeridaForFaltaBase(articuloBase: string): SancionSugerida | null {
  const art = articleNumber(articuloBase);

  if (art === 9) {
    return {
      articulo: getArticleLabel(10),
      inciso: getArticleInciso(10, 1),
    };
  }

  if (art === 10) {
    return {
      articulo: getArticleLabel(11),
      inciso: getArticleInciso(11, 1),
    };
  }

  if (art === 11) {
    return {
      articulo: getArticleLabel(12),
      inciso: getArticleInciso(12, 1),
      requiereRemisionDisciplinaria: true,
      remisionMensaje: "Corresponde remitir todos los actuados a Régimen Disciplinario del Comando Departamental de Policía.",
    };
  }

  return null;
}

export function getTerminalSancionArt12(): SancionSugerida {
  return {
    articulo: getArticleLabel(12),
    inciso: getArticleInciso(12, 1),
    requiereRemisionDisciplinaria: true,
    remisionMensaje: "Corresponde remitir todos los actuados a Régimen Disciplinario del Comando Departamental de Policía.",
  };
}

export function canEscalateFromArticulo(articuloBase: string): boolean {
  const art = articleNumber(articuloBase);
  return art === 9 || art === 10 || art === 11;
}

export function sameArticulo(articuloA: string, articuloB: string): boolean {
  return articleNumber(articuloA) === articleNumber(articuloB);
}

export function isDirectReincidenciaControlSubject(articulo: string, inciso: string): boolean {
  const art = articleNumber(articulo);
  const inc = incisoNumber(inciso);
  if (art === 9 || art === 10) return inc !== null && inc > 0;
  if (art === 11) return inc !== null && inc >= 2;
  return false;
}

export function isSameTipificacion(articuloA: string, incisoA: string, articuloB: string, incisoB: string): boolean {
  return sameArticulo(articuloA, articuloB) && incisoNumber(incisoA) === incisoNumber(incisoB);
}

export function isReincidenciaOrigenMatch(
  value: unknown,
  articuloBase: string,
  incisoBase: string,
): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as { articuloBase?: unknown; incisoBase?: unknown };
  return (
    typeof record.articuloBase === "string" &&
    typeof record.incisoBase === "string" &&
    sameArticulo(record.articuloBase, articuloBase) &&
    incisoNumber(record.incisoBase) === incisoNumber(incisoBase)
  );
}

function getArticleLabel(number: 9 | 10 | 11 | 12): string {
  const id = `art${number}` as const;
  return DISCIPLINARY_CATALOG.find((article) => article.id === id)?.label ?? `Art. ${number}`;
}

function getArticleInciso(articleNumberValue: 9 | 10 | 11 | 12, incisoNumberValue: number): string {
  const id = `art${articleNumberValue}` as const;
  const article = DISCIPLINARY_CATALOG.find((item) => item.id === id);
  return article?.incisos.find((inciso) => incisoNumber(inciso) === incisoNumberValue) ?? `${incisoNumberValue}.`;
}
