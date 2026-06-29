import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  articleNumber,
  canEscalateFromArticulo,
  getSancionSugeridaForFaltaBase,
  getTerminalSancionArt12,
  incisoNumber,
  isDirectReincidenciaControlSubject,
  isRegimenDisciplinarioReferral,
  isReincidenciaEscalada,
  isReincidenciaOrigenMatch,
} from "@/lib/domain/disciplinary-recidivism";
import { createFaltaSchema } from "@/lib/domain/schemas";
import { normalizeCi, normalizeFreeText, toTitleCaseEs } from "@/lib/domain/text-normalization";
import {
  buildReincidenciaWindow,
  formatReincidenciaMessage,
  parseFechaSancion,
} from "@/lib/faltas/reincidencia";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  isBsfpIntegrationEnabled,
  verifyIntegrationRequest,
} from "@/lib/integraciones/service-auth";

const integrationSancionSchema = z.object({
  sourceApp: z.literal("BSFP"),
  externalId: z.string().transform(normalizeFreeText).pipe(z.string().min(6)),
  ci: z.string().transform(normalizeCi).pipe(z.string().min(5)),
  unidadSancionId: z.string().transform(normalizeFreeText).pipe(z.string().min(1)),
  unidadSancionNombre: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
  unidadEfectivoHistoricaId: z.string().transform(normalizeFreeText).optional(),
  articulo: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
  inciso: z.string().transform(normalizeFreeText).pipe(z.string().min(1)),
  fechaSancion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memorandum: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
  motivo: z.string().transform(normalizeFreeText).pipe(z.string().min(3)),
  modoRegistro: z.enum(["actual", "historico"]).default("historico"),
  reincidenciaOrigen: z
    .object({
      articuloBase: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
      incisoBase: z.string().transform(normalizeFreeText).pipe(z.string().min(1)),
      faltaReferenciaId: z.string().min(1),
    })
    .optional()
    .nullable(),
});

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function bodyHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function timestampToIsoDate(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate?: () => Date }).toDate?.()?.toISOString?.()?.slice(0, 10) ?? null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isBsfpIntegrationEnabled()) {
    return json(503, {
      ok: false,
      code: "INTEGRATION_DISABLED",
      message: "La integracion BSFP esta preparada pero no activada",
    });
  }

  const auth = verifyIntegrationRequest(request.headers, rawBody);
  if (!auth.ok) {
    return json(auth.status, { ok: false, code: auth.code, message: auth.message });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, code: "INVALID_JSON", message: "JSON invalido" });
  }

  const parsed = integrationSancionSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, {
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.message,
    });
  }

    const input = parsed.data;
  if (isRegimenDisciplinarioReferral(input.articulo, input.inciso)) {
    return json(409, {
      ok: false,
      code: "REQUIRES_DISCIPLINARY_REFERRAL",
      message: "Art. 12 inc. 1 corresponde a remision a Regimen Disciplinario y no puede sincronizarse como falta registrada",
      sancionSugerida: getTerminalSancionArt12(),
      requiereRemisionDisciplinaria: true,
      remisionMensaje: "Corresponde remitir todos los actuados a Régimen Disciplinario del Comando Departamental de Policía.",
    });
  }
  const idempotencyId = `${input.sourceApp}:${input.externalId}`;
  const payloadHash = bodyHash(rawBody);
  const db = getAdminDb();
  const integrationRef = db.collection("integraciones_sanciones").doc(idempotencyId);

  try {
    const existing = await integrationRef.get();
    if (existing.exists) {
      const data = existing.data() ?? {};
      await integrationRef.update({
        lastReceivedAt: Timestamp.now(),
        receiveCount: Number(data.receiveCount ?? 1) + 1,
      });

      return json(200, {
        ok: true,
        code: "ALREADY_SYNCED",
        status: data.status ?? "synced",
        faltaId: data.faltaId ?? null,
        integrationId: integrationRef.id,
      });
    }

    const personalSnap = await db.collection("personal").where("ci", "==", input.ci).limit(1).get();
    if (personalSnap.empty) {
      const now = Timestamp.now();
      await integrationRef.set({
        sourceApp: input.sourceApp,
        externalId: input.externalId,
        status: "personal_not_found",
        code: "PERSONAL_NOT_FOUND",
        ci: input.ci,
        payloadHash,
        receivedPayload: input,
        createdAt: now,
        lastReceivedAt: now,
        receiveCount: 1,
      });

      return json(422, {
        ok: false,
        code: "PERSONAL_NOT_FOUND",
        message: "El CI no existe en la base departamental",
        integrationId: integrationRef.id,
      });
    }

    const personalDoc = personalSnap.docs[0];
    const personal = personalDoc.data();
    const modoRegistro = input.modoRegistro;
    const unidadEfectivoId = modoRegistro === "historico"
      ? input.unidadEfectivoHistoricaId
      : String(personal.unidadId ?? "");

    const faltaCandidate = {
      personalId: personalDoc.id,
      unidadId: input.unidadSancionId,
      articulo: input.articulo,
      inciso: input.inciso,
      fechaSancion: input.fechaSancion,
      memorandum: input.memorandum,
      motivo: input.motivo,
      modoRegistro,
      unidadEfectivoHistoricaId: unidadEfectivoId,
      reincidenciaOrigen: input.reincidenciaOrigen ?? null,
    };

    const faltaParsed = createFaltaSchema.safeParse(faltaCandidate);
    if (!faltaParsed.success) {
      return json(400, {
        ok: false,
        code: "FALTA_VALIDATION_ERROR",
        message: faltaParsed.error.message,
      });
    }

    const fechaSancion = parseFechaSancion(input.fechaSancion);
    const fechaSancionTs = Timestamp.fromDate(fechaSancion);
    const window = buildReincidenciaWindow(input.fechaSancion);
    const isSancionEscalada = isReincidenciaEscalada(input.articulo, input.inciso);

    if (!isSancionEscalada && canEscalateFromArticulo(input.articulo) && isDirectReincidenciaControlSubject(input.articulo, input.inciso)) {
      const reincidenciaSnap = await db
        .collection("faltas")
        .where("personalId", "==", personalDoc.id)
        .where("articulo", "==", input.articulo)
        .where("inciso", "==", input.inciso)
        .where("estado", "==", "registrada")
        .where("fechaSancion", ">=", window.start)
        .where("fechaSancion", "<=", window.end)
        .orderBy("fechaSancion", "asc")
        .limit(1)
        .get();

      if (!reincidenciaSnap.empty) {
        const previa = reincidenciaSnap.docs[0].data();
        const escaladasSnap = await db
          .collection("faltas")
          .where("personalId", "==", personalDoc.id)
          .where("estado", "==", "registrada")
          .where("fechaSancion", ">=", window.start)
          .where("fechaSancion", "<=", window.end)
          .orderBy("fechaSancion", "desc")
          .limit(100)
          .get();
        const escaladasMismoOrigen = escaladasSnap.docs
          .map((doc) => ({ id: doc.id, data: doc.data() }))
          .filter(({ data }) => isReincidenciaOrigenMatch(data.reincidenciaOrigen, input.articulo, input.inciso));
        const existingArt12Escalada = escaladasMismoOrigen.find(({ data }) => articleNumber(String(data.articulo ?? "")) === 12 && incisoNumber(String(data.inciso ?? "")) === 1);
        const existingArt11Escalada = escaladasMismoOrigen.find(({ data }) => articleNumber(String(data.articulo ?? "")) === 11 && incisoNumber(String(data.inciso ?? "")) === 1);
        const existingArt10Escalada = escaladasMismoOrigen.find(({ data }) => articleNumber(String(data.articulo ?? "")) === 10 && incisoNumber(String(data.inciso ?? "")) === 1);
        const now = Timestamp.now();
        const sancionSugerida = existingArt12Escalada
          ? getTerminalSancionArt12()
          : existingArt11Escalada
            ? getSancionSugeridaForFaltaBase(String(existingArt11Escalada.data.articulo ?? ""))
            : existingArt10Escalada
              ? getSancionSugeridaForFaltaBase(String(existingArt10Escalada.data.articulo ?? ""))
              : getSancionSugeridaForFaltaBase(input.articulo);
        const referenciaDoc = existingArt12Escalada ?? existingArt11Escalada ?? { id: reincidenciaSnap.docs[0].id, data: previa };
        await integrationRef.set({
          sourceApp: input.sourceApp,
          externalId: input.externalId,
          status: "blocked",
          code: "REINCIDENCIA_BLOCKED",
          ci: input.ci,
          payloadHash,
          receivedPayload: input,
          reference: {
            faltaId: referenciaDoc.id,
            fechaSancion: timestampToIsoDate(referenciaDoc.data.fechaSancion),
            memorandum: referenciaDoc.data.memorandum ?? null,
            unidadNombre: referenciaDoc.data.unidadSancionNombre ?? referenciaDoc.data.unidadNombre ?? null,
          },
          sancionSugerida,
          requiereRemisionDisciplinaria: sancionSugerida?.requiereRemisionDisciplinaria ?? false,
          remisionMensaje: sancionSugerida?.remisionMensaje ?? null,
          createdAt: now,
          lastReceivedAt: now,
          receiveCount: 1,
        });

        return json(409, {
          ok: false,
          code: "REINCIDENCIA_BLOCKED",
          message: formatReincidenciaMessage(),
          sancionSugerida,
          requiereRemisionDisciplinaria: sancionSugerida?.requiereRemisionDisciplinaria ?? false,
          remisionMensaje: sancionSugerida?.remisionMensaje ?? null,
          integrationId: integrationRef.id,
        });
      }
    }

    const now = Timestamp.now();
    const faltaRef = db.collection("faltas").doc();
    const personalUnidadId = String(personal.unidadId ?? "");
    const personalUnidadNombre = String(personal.unidadNombre ?? "");

    const faltaPayload = {
      personalId: personalDoc.id,
      unidadId: input.unidadSancionId,
      unidadNombre: input.unidadSancionNombre,
      unidadSancionId: input.unidadSancionId,
      unidadSancionNombre: input.unidadSancionNombre,
      unidadEfectivoId: unidadEfectivoId || personalUnidadId,
      unidadEfectivoNombre: modoRegistro === "historico" ? null : personalUnidadNombre,
      ci: input.ci,
      nombreCompleto: personal.nombreCompleto ?? "",
      grado: personal.grado ?? "",
      articulo: input.articulo,
      inciso: input.inciso,
      fechaSancion: fechaSancionTs,
      memorandum: input.memorandum,
      motivo: input.motivo,
      tipoRegistro: isSancionEscalada ? "reincidencia_escalada" : "falta_directa",
      modoRegistro,
      cargaHistorica: modoRegistro === "historico",
      unidadActualEfectivoId: personalUnidadId,
      unidadActualEfectivoNombre: personalUnidadNombre,
      reincidencia: isSancionEscalada,
      reincidenciaReferencia: input.reincidenciaOrigen ?? null,
      reincidenciaOrigen: input.reincidenciaOrigen ?? null,
      estado: "registrada",
      integrationSource: input.sourceApp,
      integrationExternalId: input.externalId,
      createdAt: now,
      updatedAt: now,
      createdBy: {
        uid: "integration:BSFP",
        email: "integration:BSFP",
        role: "service_integration",
      },
      updatedBy: {
        uid: "integration:BSFP",
        email: "integration:BSFP",
        role: "service_integration",
      },
    };

    await db.runTransaction(async (tx) => {
      const integrationSnap = await tx.get(integrationRef);
      if (integrationSnap.exists) return;

      tx.set(faltaRef, faltaPayload);
      tx.set(integrationRef, {
        sourceApp: input.sourceApp,
        externalId: input.externalId,
        status: "synced",
        faltaId: faltaRef.id,
        ci: input.ci,
        payloadHash,
        receivedPayload: input,
        createdAt: now,
        lastReceivedAt: now,
        receiveCount: 1,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: "integration:BSFP",
        actorEmail: "integration:BSFP",
        actorRole: "service_integration",
        action: "sync_falta_from_bsfp",
        entity: "falta",
        entityId: faltaRef.id,
        unidadId: input.unidadSancionId,
        before: null,
        after: faltaPayload,
        createdAt: now,
      });
    });

    return json(201, {
      ok: true,
      code: "SYNCED",
      faltaId: faltaRef.id,
      integrationId: integrationRef.id,
    });
  } catch (error) {
    console.error("POST /api/integraciones/sanciones failed", {
      error,
      message: error instanceof Error ? error.message : "unknown_error",
    });

    return json(500, {
      ok: false,
      code: "INTEGRATION_ERROR",
      message: "No se pudo procesar la sancion integrada",
    });
  }
}
