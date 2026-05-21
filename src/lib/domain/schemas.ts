import { z } from "zod";

import {
  FALTA_ESTADOS,
  PERSONAL_ESTADOS,
  USER_ROLES,
} from "@/lib/domain/constants";
import {
  getArticuloBaseForSancionEscalada,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";
import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import {
  normalizeCi,
  normalizeFreeText,
  normalizePersonName,
  toTitleCaseEs,
} from "@/lib/domain/text-normalization";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD");

export const userRoleSchema = z.enum(USER_ROLES);
export const faltaEstadoSchema = z.enum(FALTA_ESTADOS);
export const personalEstadoSchema = z.enum(PERSONAL_ESTADOS);

export const reincidenciaOrigenSchema = z.object({
  articuloBase: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
  incisoBase: z.string().transform(normalizeFreeText).pipe(z.string().min(1)),
  faltaReferenciaId: z.string().min(1),
});

export const createFaltaSchema = z
  .object({
    personalId: z.string().min(1),
    unidadId: z.string().min(1),
    articulo: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
    inciso: z.string().transform(normalizeFreeText).pipe(z.string().min(1)),
    fechaSancion: isoDateSchema,
    memorandum: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
    motivo: z.string().transform(normalizeFreeText).pipe(z.string().min(3)),
    modoRegistro: z.enum(["actual", "historico"]).optional(),
    unidadEfectivoHistoricaId: z.string().optional(),
    reincidenciaOrigen: reincidenciaOrigenSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const isEscalada = isReincidenciaEscalada(value.articulo, value.inciso);

    if (!isEscalada && value.reincidenciaOrigen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reincidenciaOrigen"],
        message: "Solo Art. 10 inc. 1 y Art. 11 inc. 1 pueden incluir origen de reincidencia",
      });
      return;
    }

    if (isEscalada && !value.reincidenciaOrigen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reincidenciaOrigen"],
        message: "Debe especificar la falta del articulo anterior que origina la reincidencia",
      });
      return;
    }

    if (isEscalada && value.reincidenciaOrigen) {
      const articuloBaseEsperado = getArticuloBaseForSancionEscalada(value.articulo, value.inciso);
      if (!articuloBaseEsperado || !sameArticulo(value.reincidenciaOrigen.articuloBase, articuloBaseEsperado)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reincidenciaOrigen", "articuloBase"],
          message: "El articulo base no corresponde a la sancion superior seleccionada",
        });
      }
    }

    if (value.modoRegistro === "historico" && !value.unidadEfectivoHistoricaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unidadEfectivoHistoricaId"],
        message: "Debe seleccionar la unidad donde prestaba funciones al momento de la sancion",
      });
    }
  });

export const listFaltasSearchSchema = z.object({
  q: z.string().optional(),
  personalId: z.string().optional(),
  unidadId: z.string().optional(),
  scope: z.enum(["unit", "global_person"]).optional(),
  articulo: z.string().optional(),
  inciso: z.string().optional(),
  reincidencia: z.enum(["true", "false"]).optional(),
  fechaInicio: isoDateSchema.optional(),
  fechaFin: isoDateSchema.optional(),
  estado: faltaEstadoSchema.optional(),
});

export const createPersonalSchema = z.object({
  ci: z.string().transform(normalizeCi).pipe(z.string().min(5)),
  grado: z
    .string()
    .transform((value) => resolveRangoPolicial(value))
    .refine((result) => result.ok, "Grado policial no válido")
    .transform((result) => result.gradoFinal),
  nombres: z.string().transform(normalizePersonName).pipe(z.string().min(1)),
  apellidos: z.string().transform(normalizePersonName).pipe(z.string().min(1)),
  sexo: z.enum(["Masculino", "Femenino"]),
  unidadId: z.string().min(1),
  unidadNombre: z.string().transform(toTitleCaseEs).pipe(z.string().min(1)),
  estado: personalEstadoSchema,
});

export const createFaltaDeleteRequestSchema = z
  .object({
    faltaId: z.string().min(1),
    tipoSolicitud: z.enum(["representacion", "error_insercion"]),
    memorandumRepresentacion: z.string().optional(),
    motivo: z.string().optional(),
    comentario: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const memo = normalizeFreeText(value.memorandumRepresentacion ?? "");
    const motivo = normalizeFreeText(value.motivo ?? "");
    const comentario = normalizeFreeText(value.comentario ?? "");

    if (value.tipoSolicitud === "representacion") {
      if (memo.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["memorandumRepresentacion"],
          message: "El número de memorándum de representación es obligatorio",
        });
      }

      if (comentario.length > 0 && comentario.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["comentario"],
          message: "El comentario debe tener al menos 4 caracteres",
        });
      }
    }

    if (value.tipoSolicitud === "error_insercion" && motivo.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivo"],
        message: "Debe detallar el motivo del error de inserción (mínimo 8 caracteres)",
      });
    }
  })
  .transform((value) => {
    const memo = normalizeFreeText(value.memorandumRepresentacion ?? "");
    const motivo = normalizeFreeText(value.motivo ?? "");
    const comentario = normalizeFreeText(value.comentario ?? "");

    if (value.tipoSolicitud === "representacion") {
      return {
        faltaId: value.faltaId,
        tipoSolicitud: value.tipoSolicitud,
        memorandumRepresentacion: memo,
        comentario: comentario || null,
        motivo: "Representación de la sanción",
      };
    }

    return {
      faltaId: value.faltaId,
      tipoSolicitud: value.tipoSolicitud,
      memorandumRepresentacion: null,
      comentario: comentario || null,
      motivo,
    };
  });

export const resolveFaltaDeleteRequestSchema = z.object({
  decision: z.enum(["aprobada", "rechazada"]),
  motivoResolucion: z.string().transform(normalizeFreeText).pipe(z.string().min(6)),
});

export type CreateFaltaInput = z.infer<typeof createFaltaSchema>;
