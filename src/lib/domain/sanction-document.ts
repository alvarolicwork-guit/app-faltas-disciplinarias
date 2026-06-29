export const ACTA_PREFIX = "Acta-";
export const MEMORANDUM_PREFIX = "Memor\u00e1ndum-";

const KNOWN_PREFIX_PATTERN = /^(acta|memo|memorandum|memor\u00e1ndum)-?/i;

export function getSanctionDocumentPrefix(articleIdOrLabel: string): string {
  const value = articleIdOrLabel.trim().toLowerCase();
  return value === "art9" || value.startsWith("art. 9") ? ACTA_PREFIX : MEMORANDUM_PREFIX;
}

export function extractSanctionDocumentNumber(value: string): string {
  const withoutPrefix = value.trim().replace(KNOWN_PREFIX_PATTERN, "");
  const digits = withoutPrefix.replace(/\D/g, "").slice(0, 7);
  const number = digits.slice(0, 3);
  const year = digits.slice(3, 7);
  return year ? `${number}/${year}` : number;
}

export function formatSanctionDocumentNumber(articleIdOrLabel: string, value: string): string {
  const prefix = getSanctionDocumentPrefix(articleIdOrLabel);
  return `${prefix}${extractSanctionDocumentNumber(value)}`;
}

export function isValidSanctionDocumentNumber(articleIdOrLabel: string, value: string): boolean {
  const prefix = getSanctionDocumentPrefix(articleIdOrLabel);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedPrefix}\\d{3}/\\d{4}$`).test(value);
}
