import { createHmac, timingSafeEqual } from "crypto";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

export type IntegrationAuthResult =
  | { ok: true; source: "BSFP" }
  | { ok: false; status: number; code: string; message: string };

function readSecretForSource(source: string): string | null {
  if (source === "BSFP") return process.env.BSFP_INTEGRATION_SECRET ?? null;
  return null;
}

function isFreshTimestamp(value: string): boolean {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  return Math.abs(Date.now() - time) <= MAX_TIMESTAMP_DRIFT_MS;
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function isBsfpIntegrationEnabled(): boolean {
  return process.env.BSFP_INTEGRATION_ENABLED === "true";
}

export function verifyIntegrationRequest(headers: Headers, rawBody: string): IntegrationAuthResult {
  const source = headers.get("x-integration-source")?.trim().toUpperCase() ?? "";
  const timestamp = headers.get("x-integration-timestamp")?.trim() ?? "";
  const signature = headers.get("x-integration-signature")?.trim().toLowerCase() ?? "";

  if (source !== "BSFP") {
    return { ok: false, status: 401, code: "INVALID_SOURCE", message: "Origen de integracion no autorizado" };
  }

  const secret = readSecretForSource(source);
  if (!secret) {
    return { ok: false, status: 503, code: "INTEGRATION_SECRET_MISSING", message: "Secreto de integracion no configurado" };
  }

  if (!timestamp || !isFreshTimestamp(timestamp)) {
    return { ok: false, status: 401, code: "INVALID_TIMESTAMP", message: "Timestamp de integracion invalido o vencido" };
  }

  if (!/^[a-f0-9]{64}$/.test(signature)) {
    return { ok: false, status: 401, code: "INVALID_SIGNATURE", message: "Firma de integracion invalida" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (!safeCompare(signature, expected)) {
    return { ok: false, status: 401, code: "SIGNATURE_MISMATCH", message: "Firma de integracion no coincide" };
  }

  return { ok: true, source };
}
