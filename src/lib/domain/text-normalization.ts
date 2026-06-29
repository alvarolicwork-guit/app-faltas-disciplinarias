const UPPERCASE_KEEP = new Set(["CI", "MSC", "CAD", "DEAP"]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCi(value: string): string {
  return normalizeWhitespace(value).replace(/\s+/g, "").toUpperCase();
}

export function ciKey(value: string): string {
  return normalizeCi(value).replace(/[^A-Z0-9]/g, "");
}

export function toTitleCaseEs(value: string): string {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word) => {
      const onlyLetters = word.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
      const normalizedUpper = onlyLetters.toUpperCase();
      if (UPPERCASE_KEEP.has(normalizedUpper)) {
        return normalizedUpper;
      }

      const lower = word.toLocaleLowerCase("es-ES");
      return lower.charAt(0).toLocaleUpperCase("es-ES") + lower.slice(1);
    })
    .join(" ");
}

export function normalizeFreeText(value: string): string {
  return toTitleCaseEs(value);
}

export function normalizePersonName(value: string): string {
  return toTitleCaseEs(value);
}

export function normalizeUnitName(value: string): string {
  return normalizeWhitespace(value).toLocaleUpperCase("es-BO");
}
