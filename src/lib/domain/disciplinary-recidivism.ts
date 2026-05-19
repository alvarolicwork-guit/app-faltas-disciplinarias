import { DISCIPLINARY_CATALOG } from "@/lib/domain/disciplinary-catalog";

export type ReincidenciaOrigenInput = {
  articuloBase: string;
  incisoBase: string;
  faltaReferenciaId: string;
};

export type SancionSugerida = {
  articulo: string;
  inciso: string;
};

function articleNumber(value: string): 9 | 10 | 11 | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("art. 9") || normalized.includes("articulo 9")) return 9;
  if (normalized.includes("art. 10") || normalized.includes("articulo 10")) return 10;
  if (normalized.includes("art. 11") || normalized.includes("articulo 11")) return 11;
  return null;
}

function incisoNumber(value: string): number | null {
  const match = value.trim().match(/^(\d+)\s*[.)]/);
  if (!match) return null;
  return Number(match[1]);
}

export function isReincidenciaEscalada(articulo: string, inciso: string): boolean {
  const art = articleNumber(articulo);
  const inc = incisoNumber(inciso);
  return (art === 10 || art === 11) && inc === 1;
}

export function getArticuloBaseForSancionEscalada(articulo: string, inciso: string): string | null {
  if (!isReincidenciaEscalada(articulo, inciso)) return null;

  const art = articleNumber(articulo);
  if (art === 10) return getArticleLabel(9);
  if (art === 11) return getArticleLabel(10);
  return null;
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

  return null;
}

export function canEscalateFromArticulo(articuloBase: string): boolean {
  const art = articleNumber(articuloBase);
  return art === 9 || art === 10;
}

export function sameArticulo(articuloA: string, articuloB: string): boolean {
  return articleNumber(articuloA) === articleNumber(articuloB);
}

function getArticleLabel(number: 9 | 10 | 11): string {
  const id = `art${number}` as const;
  return DISCIPLINARY_CATALOG.find((article) => article.id === id)?.label ?? `Art. ${number}`;
}

function getArticleInciso(articleNumberValue: 9 | 10 | 11, incisoNumberValue: number): string {
  const id = `art${articleNumberValue}` as const;
  const article = DISCIPLINARY_CATALOG.find((item) => item.id === id);
  return article?.incisos.find((inciso) => incisoNumber(inciso) === incisoNumberValue) ?? `${incisoNumberValue}.`;
}
