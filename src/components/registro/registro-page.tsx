"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { ImportarSancionesHistoricas } from "@/components/registro/importar-sanciones-historicas";
import { useApi, ApiError } from "@/hooks/use-api";
import { useAuth, isGlobalRole, isUnitScopedRole } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { DISCIPLINARY_CATALOG, type DisciplinaryArticle } from "@/lib/domain/disciplinary-catalog";
import {
  canBulkImportHistoricalSanctions,
  canRegisterHistoricalFalta,
} from "@/lib/domain/roles";
import {
  getArticulosBaseForSancionEscalada,
  isRegimenDisciplinarioReferral,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";
import { formatFaltaOrigenOption, type ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";
import {
  extractSanctionDocumentNumber,
  formatSanctionDocumentNumber,
  getSanctionDocumentPrefix,
  isValidSanctionDocumentNumber,
} from "@/lib/domain/sanction-document";

type Personal = {
  id: string;
  ci: string;
  nombreCompleto: string;
  unidadId: string;
  unidadNombre: string;
  transferRequired?: boolean;
  canTransferToMyUnit?: boolean;
  canTransferToAnyUnit?: boolean;
};

type FaltaOrigen = {
  id: string;
  articulo: string;
  inciso: string;
  fechaSancion: string;
  memorandum: string;
  unidadSancionNombre?: string;
  unidadNombre?: string;
  reincidenciaOrigen?: ReincidenciaOrigenView;
};

type ReincidenciaOrigenState = {
  articuloBase: string;
  incisoBase: string;
  faltaReferenciaId: string;
} | null;

type ReincidenciaNotice = {
  suggestedArticle: string;
  suggestedInciso: string;
  originArticle: string;
  originInciso: string;
  memo?: string;
  date?: string;
  unit?: string;
  motivoCadena?: string | null;
  remisionMensaje?: string | null;
  requiresReferral?: boolean;
} | null;

export function RegistroPage() {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { invalidate } = useDataCache();
  const { unitOptions, getUnitName } = useUnidades();
  const toast = useToast();

  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [registroMode, setRegistroMode] = useState<"actual" | "historico">("actual");
  const [historicalDutyUnitId, setHistoricalDutyUnitId] = useState("");
  const [personalRows, setPersonalRows] = useState<Personal[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferTargetUnitId, setTransferTargetUnitId] = useState("");
  const [origenRows, setOrigenRows] = useState<FaltaOrigen[]>([]);
  const [origenLoading, setOrigenLoading] = useState(false);
  const [reincidenciaOrigen, setReincidenciaOrigen] = useState<ReincidenciaOrigenState>(null);
  const [reincidenciaNotice, setReincidenciaNotice] = useState<ReincidenciaNotice>(null);

  const [form, setForm] = useState({
    articuloId: "",
    inciso: "",
    fechaSancion: new Date().toISOString().slice(0, 10),
    memorandum: "",
    motivo: "",
  });

  const canSelectUnit = sessionUser ? !isUnitScopedRole(sessionUser.role) : false;
  const isGlobalActor = sessionUser ? isGlobalRole(sessionUser.role) : false;
  const canUseHistoricalMode = sessionUser ? canRegisterHistoricalFalta(sessionUser.role) : false;
  const canUseBulkHistoricalImport = sessionUser
    ? canBulkImportHistoricalSanctions(sessionUser.role)
    : false;
  const isHistoricalMode = canUseHistoricalMode && registroMode === "historico";
  const effectiveUnitId = canSelectUnit ? selectedUnitId : (sessionUser?.unidadId ?? "");
  const personalSearchUnitId = isHistoricalMode ? "" : effectiveUnitId;

  const selectedPersonal = useMemo(() => personalRows.find((r) => r.id === selectedPersonalId) ?? null, [personalRows, selectedPersonalId]);
  const selectedArticle = useMemo(() => DISCIPLINARY_CATALOG.find((a) => a.id === form.articuloId) ?? null, [form.articuloId]);
  const sanctionDocumentPrefix = selectedArticle ? getSanctionDocumentPrefix(selectedArticle.id) : getSanctionDocumentPrefix("");
  const isSancionEscalada = selectedArticle ? isReincidenciaEscalada(selectedArticle.label, form.inciso) : false;
  const requiresDisciplinaryReferral = selectedArticle ? isRegimenDisciplinarioReferral(selectedArticle.label, form.inciso) : false;
  const articulosBaseEsperados = selectedArticle ? getArticulosBaseForSancionEscalada(selectedArticle.label, form.inciso) : [];
  const sanctionUnitOptions = useMemo(
    () => [{ value: "", label: "Todas las unidades" }, ...unitOptions],
    [unitOptions],
  );

  const refreshPersonal = useCallback(async (q = "", unidad = effectiveUnitId) => {
    if (!unidad && !q.trim()) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (unidad) {
      params.set("unidadId", unidad);
    }
    const query = params.toString() ? `?${params}` : "";
    try {
      const payload = await get<{ data: Personal[] }>(`/api/personal${query}`);
      setPersonalRows(payload.data);
      return { ok: true as const };
    } catch (error) {
      setPersonalRows([]);
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "No se pudo consultar personal",
      };
    }
  }, [get, effectiveUnitId]);

  useEffect(() => {
    if (isHistoricalMode || !effectiveUnitId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPersonal("", effectiveUnitId);
  }, [effectiveUnitId, refreshPersonal, isHistoricalMode]);

  function handleSearchPersonal(e: FormEvent) {
    e.preventDefault();
    void (async () => {
      const result = await refreshPersonal(searchText, personalSearchUnitId);
      if (result && !result.ok) {
        toast.error("Error al buscar personal", result.message);
      }
    })();
  }

  function handleUnitChange(unitId: string) {
    setSelectedUnitId(unitId);
    if (isHistoricalMode) {
      return;
    }

    setSearchText("");
    setSelectedPersonalId("");
    setPersonalRows([]);
    setTransferTargetUnitId("");
    setOrigenRows([]);
    setReincidenciaOrigen(null);
    setReincidenciaNotice(null);
  }

  function handleRegistroModeChange(mode: "actual" | "historico") {
    setRegistroMode(mode);
    setSelectedUnitId("");
    setHistoricalDutyUnitId("");
    setSearchText("");
    setSelectedPersonalId("");
    setPersonalRows([]);
    setTransferTargetUnitId("");
    setOrigenRows([]);
    setReincidenciaOrigen(null);
    setReincidenciaNotice(null);
  }

  function getArticleIdByLabel(label: string): DisciplinaryArticle["id"] | "" {
    return DISCIPLINARY_CATALOG.find((article) => label.includes(article.label.split(" - ")[0]))?.id ?? "";
  }

  function handleArticleChange(articleId: string) {
    setForm((prev) => ({
      ...prev,
      articuloId: articleId,
      inciso: "",
      memorandum: articleId ? formatSanctionDocumentNumber(articleId, prev.memorandum) : "",
    }));
    setOrigenRows([]);
    setReincidenciaOrigen(null);
    setReincidenciaNotice(null);
  }

  function handleMemorandumChange(value: string) {
    if (!selectedArticle) {
      setForm((prev) => ({ ...prev, memorandum: extractSanctionDocumentNumber(value) }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      memorandum: formatSanctionDocumentNumber(selectedArticle.id, value),
    }));
  }

  function handleIncisoChange(inciso: string) {
    setForm((prev) => ({ ...prev, inciso }));
    setOrigenRows([]);
    setReincidenciaOrigen(null);
    setReincidenciaNotice(null);

    if (selectedArticle && selectedPersonal && isReincidenciaEscalada(selectedArticle.label, inciso)) {
      const bases = getArticulosBaseForSancionEscalada(selectedArticle.label, inciso);
      if (bases.length > 0) void refreshOrigenRows(selectedPersonal.id, bases);
    }
  }

function selectOrigen(origenId: string) {
    const row = origenRows.find((item) => item.id === origenId);
    if (!row) {
      setReincidenciaOrigen(null);
      return;
    }

    setReincidenciaOrigen({
      articuloBase: row.articulo,
      incisoBase: row.inciso,
      faltaReferenciaId: row.id,
    });
  }

  const refreshOrigenRows = useCallback(async (personalId: string, articulosBase: string[]) => {
    if (!personalId || articulosBase.length === 0) {
      setOrigenRows([]);
      return;
    }

    setOrigenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("personalId", personalId);
      params.set("estado", "registrada");
      const payload = await get<{ data: FaltaOrigen[] }>(`/api/faltas?${params}`);
      setOrigenRows(payload.data.filter((row) => articulosBase.some((articuloBase) => sameArticulo(row.articulo, articuloBase))));
    } catch {
      setOrigenRows([]);
    } finally {
      setOrigenLoading(false);
    }
  }, [get]);

  function handlePreSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPersonal) { toast.warning("Seleccione un efectivo"); return; }
    if (requiresDisciplinaryReferral) {
      toast.warning(
        "Remision a Regimen Disciplinario",
        "Art. 12 inc. 1 no se registra como falta en esta app. Remita los actuados a Regimen Disciplinario.",
      );
      return;
    }
    if (!effectiveUnitId) { toast.warning(isHistoricalMode ? "Seleccione la unidad que impuso la sanción" : "Seleccione la unidad que impone la sanción"); return; }
    if (isHistoricalMode && !historicalDutyUnitId) { toast.warning("Seleccione la unidad donde prestaba funciones al momento de la sanción"); return; }
    if (!selectedArticle || !form.inciso) { toast.warning("Seleccione artículo e inciso"); return; }
    if (isSancionEscalada && !reincidenciaOrigen) {
      toast.warning("Seleccione la falta del artículo anterior que origina la reincidencia");
      return;
    }
    if (!form.memorandum.trim() || !selectedArticle || !isValidSanctionDocumentNumber(selectedArticle.id, form.memorandum)) {
      toast.warning("Ingrese el número de memorándum/Acta", `Formato esperado: ${sanctionDocumentPrefix}001/2026`);
      return;
    }
    if (!form.motivo.trim()) { toast.warning("Ingrese el motivo disciplinario"); return; }
    setConfirmOpen(true);
  }

  async function handleConfirmRegister() {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await post("/api/faltas", {
        personalId: selectedPersonal!.id,
        unidadId: effectiveUnitId,
        articulo: selectedArticle!.label,
        inciso: form.inciso,
        fechaSancion: form.fechaSancion,
        memorandum: form.memorandum,
        motivo: form.motivo,
        modoRegistro: isHistoricalMode ? "historico" : "actual",
        unidadEfectivoHistoricaId: isHistoricalMode ? historicalDutyUnitId : undefined,
        reincidenciaOrigen,
      });
      toast.success("Sanción registrada", "El registro se guardó correctamente.");
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("reportes:");
      setForm((prev) => ({ ...prev, inciso: "", memorandum: "", motivo: "" }));
      setSelectedPersonalId("");
      setOrigenRows([]);
      setReincidenciaOrigen(null);
      setReincidenciaNotice(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const payload = err.payload as {
          referencia?: { memorandum?: string; fechaSancion?: string; unidadNombre?: string };
          sancionSugerida?: { articulo: string; inciso: string };
          requiereRemisionDisciplinaria?: boolean;
          remisionMensaje?: string | null;
          motivoCadena?: string | null;
          reincidenciaOrigen?: {
            articuloBase: string;
            incisoBase: string;
            faltaReferenciaId: string;
          };
        };
        const ref = payload?.referencia;
        const articleId = payload.sancionSugerida?.articulo ? getArticleIdByLabel(payload.sancionSugerida.articulo) : "";
        if (articleId && payload.sancionSugerida && payload.reincidenciaOrigen) {
          setForm((prev) => ({
            ...prev,
            articuloId: articleId,
            inciso: payload.sancionSugerida!.inciso,
          }));
          setOrigenRows([{
            id: payload.reincidenciaOrigen.faltaReferenciaId,
            articulo: payload.reincidenciaOrigen.articuloBase,
            inciso: payload.reincidenciaOrigen.incisoBase,
            fechaSancion: ref?.fechaSancion?.slice(0, 10) ?? "",
            memorandum: ref?.memorandum ?? "",
            unidadSancionNombre: ref?.unidadNombre,
          }]);
          setReincidenciaOrigen({
            articuloBase: payload.reincidenciaOrigen.articuloBase,
            incisoBase: payload.reincidenciaOrigen.incisoBase,
            faltaReferenciaId: payload.reincidenciaOrigen.faltaReferenciaId,
          });
          setReincidenciaNotice({
            suggestedArticle: payload.sancionSugerida.articulo,
            suggestedInciso: payload.sancionSugerida.inciso,
            originArticle: payload.reincidenciaOrigen.articuloBase,
            originInciso: payload.reincidenciaOrigen.incisoBase,
            memo: ref?.memorandum,
            date: ref?.fechaSancion?.slice(0, 10),
            unit: ref?.unidadNombre,
            motivoCadena: payload.motivoCadena,
            remisionMensaje: payload.remisionMensaje,
            requiresReferral: payload.requiereRemisionDisciplinaria,
          });
        }
        const remision = payload.requiereRemisionDisciplinaria
          ? ` ${payload.remisionMensaje ?? "Corresponde remitir actuados a Régimen Disciplinario."}`
          : "";
        const detalleCadena = payload.motivoCadena ? `${payload.motivoCadena} ` : "";
        toast.error(
          "Reincidencia detectada",
          `${detalleCadena}Debe registrar la sancion superior ${payload.sancionSugerida?.articulo?.split(" - ")[0] ?? "correspondiente"} inciso 1. Memo previo: ${ref?.memorandum ?? "N/A"} (${ref?.fechaSancion?.slice(0, 10) ?? "N/A"}).${remision}`,
        );
      } else {
        toast.error("Error", err instanceof Error ? err.message : "No se pudo registrar");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTransferToMyUnit() {
    if (!selectedPersonal) return;
    const motivo = window.prompt("Motivo de transferencia (obligatorio)");
    if (!motivo?.trim()) {
      toast.warning("Debe indicar un motivo de transferencia");
      return;
    }

    setTransferBusy(true);
    try {
      await post(`/api/personal/${selectedPersonal.id}/transfer`, {
        motivoTransferencia: motivo.trim(),
        fromUnidadId: selectedPersonal.unidadId,
      });
      toast.success("Transferencia completada", "El funcionario ahora pertenece a su unidad.");
      invalidate(`personal:unidad:${selectedPersonal.unidadId}`);
      invalidate(`personal:unidad:${effectiveUnitId}`);
      invalidate("transferencias:");
      invalidate("dashboard:");
      await refreshPersonal(searchText, effectiveUnitId);
    } catch (err) {
      toast.error("Error de transferencia", err instanceof Error ? err.message : "No se pudo transferir");
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleTransferToSelectedUnit() {
    if (!selectedPersonal) return;
    if (!transferTargetUnitId) {
      toast.warning("Seleccione la unidad destino");
      return;
    }

    const motivo = window.prompt("Motivo de reasignación (obligatorio)");
    if (!motivo?.trim()) {
      toast.warning("Debe indicar un motivo de reasignación");
      return;
    }

    setTransferBusy(true);
    try {
      await post(`/api/personal/${selectedPersonal.id}/transfer`, {
        motivoTransferencia: motivo.trim(),
        fromUnidadId: selectedPersonal.unidadId,
        toUnidadId: transferTargetUnitId,
      });
      toast.success("Reasignación completada", "El funcionario fue reasignado a la unidad destino.");
      invalidate(`personal:unidad:${selectedPersonal.unidadId}`);
      invalidate(`personal:unidad:${transferTargetUnitId}`);
      invalidate("transferencias:");
      invalidate("dashboard:");
      await refreshPersonal(searchText, effectiveUnitId);
    } catch (err) {
      toast.error("Error de reasignación", err instanceof Error ? err.message : "No se pudo reasignar");
    } finally {
      setTransferBusy(false);
    }
  }

  const articleOptions = DISCIPLINARY_CATALOG.map((a) => ({ value: a.id, label: a.label }));
  const incisoOptions = selectedArticle?.incisos.map((inc) => ({ value: inc, label: inc })) ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      {canUseHistoricalMode && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--navy-900)]">Tipo de registro</h3>
              <p className="text-sm text-[var(--navy-500)]">
                Use histórico para cargar sanciones pasadas sin cambiar la unidad actual del efectivo.
              </p>
            </div>
            <div className="flex gap-1 bg-[var(--navy-100)] p-1 rounded-xl self-start">
              {([
                ["actual", "Actual"],
                ["historico", "Histórico"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleRegistroModeChange(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${registroMode === mode ? "bg-white shadow-sm text-[var(--navy-900)]" : "text-[var(--navy-500)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {canUseBulkHistoricalImport && <ImportarSancionesHistoricas />}

      {/* Unit selector */}
      <Card className="p-5">
        {canSelectUnit ? (
          <div className="space-y-3">
            {isHistoricalMode && (
              <div className="rounded-xl border border-[var(--info-100)] bg-[var(--info-50)] p-3">
                <p className="text-sm font-semibold text-[var(--info-600)]">Carga histórica</p>
                <p className="mt-1 text-xs text-[var(--info-600)]">
                  La sanción se registrará con fecha y unidad histórica, sin modificar la unidad actual del efectivo.
                </p>
              </div>
            )}
            <Select
              label={isHistoricalMode ? "Unidad que impuso la sanción" : "Unidad que impone la sanción"}
              value={selectedUnitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              options={isHistoricalMode ? unitOptions : sanctionUnitOptions}
              placeholder={isHistoricalMode ? "Seleccionar unidad sancionadora" : undefined}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--navy-50)]">
            {Icons.building({ size: 18, className: "text-[var(--navy-400)]" })}
            <div>
              <p className="text-xs text-[var(--navy-400)]">Unidad operativa</p>
              <p className="text-sm font-semibold text-[var(--navy-800)]">{sessionUser?.unidadNombre ?? "Sin unidad"}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Personnel search */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-3">Seleccionar Efectivo</h3>
        {isHistoricalMode ? (
          <p className="mb-3 text-sm text-[var(--navy-500)]">
            Buscando personal en todas las unidades para carga histórica.
          </p>
        ) : canSelectUnit && !selectedUnitId && (
          <p className="mb-3 text-sm text-[var(--navy-500)]">
            Buscando personal en todas las unidades. Para registrar la sanción, seleccione una unidad concreta que la impone.
          </p>
        )}
        <form className="flex gap-2 mb-3" onSubmit={handleSearchPersonal}>
          <Input
            placeholder="Buscar por CI, nombre o apellido"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            icon={Icons.search({ size: 16 })}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" icon={Icons.search({ size: 16 })}>Buscar</Button>
        </form>

        <div className="max-h-52 overflow-auto rounded-xl border border-[var(--border)]">
          {personalRows.length > 0 ? personalRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setSelectedPersonalId(row.id);
                setOrigenRows([]);
                setReincidenciaOrigen(null);
                setReincidenciaNotice(null);
                if (selectedArticle && form.inciso && isReincidenciaEscalada(selectedArticle.label, form.inciso)) {
                  const bases = getArticulosBaseForSancionEscalada(selectedArticle.label, form.inciso);
                  if (bases.length > 0) void refreshOrigenRows(row.id, bases);
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] last:border-b-0 transition-colors ${selectedPersonalId === row.id ? "bg-[var(--gold-50)] border-l-2 border-l-[var(--gold-500)]" : "hover:bg-[var(--navy-50)]"}`}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--navy-100)] flex items-center justify-center flex-shrink-0">
                {Icons.user({ size: 14, className: "text-[var(--navy-500)]" })}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--navy-900)] truncate">{row.nombreCompleto}</p>
                <p className="text-xs text-[var(--navy-400)]">CI {row.ci}</p>
                <p className="text-xs text-[var(--navy-500)] truncate">Unidad: {row.unidadNombre || getUnitName(row.unidadId)}</p>
              </div>
              {selectedPersonalId === row.id && (
                <Badge variant="gold" className="ml-auto">Seleccionado</Badge>
              )}
            </button>
          )) : (
            <EmptyState title="Sin resultados" description={(canSelectUnit && !selectedUnitId) || isHistoricalMode ? "Busque por CI, nombre o apellido en todas las unidades." : "Busque por nombre o CI."} />
          )}
        </div>
      </Card>

      {/* Fault form */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Datos de la Sanción</h3>
        {isHistoricalMode && selectedPersonal && (
          <div className="mb-4 rounded-xl border border-[var(--info-100)] bg-[var(--info-50)] p-3">
            <p className="text-sm text-[var(--info-600)]">
              Unidad actual del efectivo: <strong>{selectedPersonal.unidadNombre || getUnitName(selectedPersonal.unidadId)}</strong>. Este dato no será modificado.
            </p>
          </div>
        )}
        {selectedPersonal?.transferRequired && !isHistoricalMode && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--warning-50)] border border-[var(--warning-100)] space-y-3">
            <p className="text-sm text-[var(--warning-600)]">
              Este funcionario está destinado en <strong>{selectedPersonal.unidadNombre}</strong>. Para aplicarle una falta en su jurisdicción, debe transferirlo primero.
            </p>
            {selectedPersonal.canTransferToMyUnit ? (
              <Button
                type="button"
                variant="secondary"
                loading={transferBusy}
                onClick={handleTransferToMyUnit}
              >
                Transferir a mi unidad
              </Button>
            ) : (
              <p className="text-xs text-[var(--warning-600)]">No tiene permisos para ejecutar esta transferencia. Contacte a un administrador de unidad.</p>
            )}
          </div>
        )}
        {isGlobalActor && selectedPersonal && !isHistoricalMode && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--info-50)] border border-[var(--info-100)] space-y-3">
            <p className="text-sm text-[var(--info-600)]">
              El efectivo pertenece a <strong>{selectedPersonal.unidadNombre || getUnitName(selectedPersonal.unidadId)}</strong>. Puede reasignarlo a otra unidad destino.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Unidad destino de reasignación"
                value={transferTargetUnitId}
                onChange={(e) => setTransferTargetUnitId(e.target.value)}
                options={unitOptions}
                placeholder="Seleccionar unidad destino"
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  loading={transferBusy}
                  onClick={handleTransferToSelectedUnit}
                  className="w-full"
                >
                  Reasignar a unidad destino
                </Button>
              </div>
            </div>
          </div>
        )}
        <form className="space-y-4" onSubmit={handlePreSubmit}>
          {reincidenciaNotice && (
            <div className="rounded-xl border border-[var(--warning-100)] bg-[var(--warning-50)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--warning-600)]">Reincidencia identificada</p>
                  <p className="mt-1 text-xs text-[var(--warning-600)]">
                    {reincidenciaNotice.motivoCadena ?? "Se identifico una reincidencia dentro del periodo de control."}
                  </p>
                </div>
                <Badge variant={reincidenciaNotice.requiresReferral ? "danger" : "gold"}>
                  {reincidenciaNotice.suggestedArticle.split(" - ")[0]} inc. 1
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-white/70 p-3 border border-[var(--warning-100)]">
                  <p className="text-xs text-[var(--navy-400)]">Antecedente usado</p>
                  <p className="text-sm font-semibold text-[var(--navy-900)]">{reincidenciaNotice.originArticle.split(" - ")[0]}</p>
                  <p className="mt-1 text-xs text-[var(--navy-600)]">{reincidenciaNotice.originInciso}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3 border border-[var(--warning-100)]">
                  <p className="text-xs text-[var(--navy-400)]">Memorándum/Acta</p>
                  <p className="text-sm font-semibold text-[var(--navy-900)]">{reincidenciaNotice.memo ?? "N/A"}</p>
                  <p className="mt-1 text-xs text-[var(--navy-600)]">{reincidenciaNotice.date ?? "N/A"}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3 border border-[var(--warning-100)]">
                  <p className="text-xs text-[var(--navy-400)]">Unidad que sanciono</p>
                  <p className="text-sm font-semibold text-[var(--navy-900)]">{reincidenciaNotice.unit ?? "N/A"}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-[var(--warning-600)]">
                Se preparo el formulario para registrar la sancion superior sugerida: {reincidenciaNotice.suggestedArticle.split(" - ")[0]} inc. 1.
              </p>
              {reincidenciaNotice.requiresReferral && (
                <p className="mt-2 text-xs font-semibold text-[var(--danger-600)]">
                  {reincidenciaNotice.remisionMensaje ?? "Corresponde remitir actuados a Régimen Disciplinario."}
                </p>
              )}
            </div>
          )}
          {isHistoricalMode && (
            <Select
              label="Unidad donde prestaba funciones al momento de la sanción"
              value={historicalDutyUnitId}
              onChange={(e) => setHistoricalDutyUnitId(e.target.value)}
              options={unitOptions}
              placeholder="Seleccionar unidad histórica del efectivo"
              required
            />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Artículo"
              value={form.articuloId}
              onChange={(e) => handleArticleChange(e.target.value)}
              options={articleOptions}
              placeholder="Seleccionar artículo"
              required
            />
            <Select
              label="Inciso"
              value={form.inciso}
              onChange={(e) => handleIncisoChange(e.target.value)}
              options={incisoOptions}
              placeholder="Seleccionar inciso"
              disabled={!selectedArticle}
              required
            />
          </div>
          {isSancionEscalada && (
            <div className="rounded-xl border border-[var(--warning-100)] bg-[var(--warning-50)] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[var(--warning-600)]">Origen obligatorio de reincidencia</p>
                <p className="text-xs text-[var(--warning-600)] mt-1">
                  Esta sanción debe referir la falta previa de {articulosBaseEsperados.map((articulo) => articulo.split(" - ")[0]).join(" o ") || "artículo anterior"} que fue reincidida.
                </p>
              </div>
              <Select
                label="Falta previa reincidida"
                value={reincidenciaOrigen?.faltaReferenciaId ?? ""}
                onChange={(e) => selectOrigen(e.target.value)}
                options={origenRows.map((row) => ({
                  value: row.id,
                  label: formatFaltaOrigenOption(row),
                }))}
                placeholder={origenLoading ? "Cargando faltas previas..." : "Seleccionar falta previa"}
                disabled={origenLoading || origenRows.length === 0}
                required
              />
              {!origenLoading && origenRows.length === 0 && (
                <p className="text-xs text-[var(--warning-600)]">
                  No se encontraron faltas previas registradas del artículo anterior para este efectivo.
                </p>
              )}
            </div>
          )}
          {requiresDisciplinaryReferral && (
            <div className="rounded-xl border border-[var(--danger-100)] bg-[var(--danger-50)] p-4">
              <p className="text-sm font-semibold text-[var(--danger-600)]">Remisión a Régimen Disciplinario</p>
              <p className="mt-1 text-xs text-[var(--danger-600)]">
                Esta reincidencia corresponde a falta grave. Remita todos los actuados a Régimen Disciplinario del Comando Departamental de Policía.
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Fecha de sanción"
              type="date"
              value={form.fechaSancion}
              onChange={(e) => setForm((p) => ({ ...p, fechaSancion: e.target.value }))}
              required
            />
            <Input
              label="Número de memorándum/Acta"
              placeholder={`Ej: ${sanctionDocumentPrefix}001/2026`}
              value={form.memorandum}
              onChange={(e) => handleMemorandumChange(e.target.value)}
              inputMode="numeric"
              pattern={`${sanctionDocumentPrefix}\\d{3}/\\d{4}`}
              disabled={!selectedArticle}
              required
            />
          </div>
          <Textarea
            label="Motivo disciplinario"
            rows={3}
            placeholder="Describa el motivo de la sanción disciplinaria..."
            value={form.motivo}
            onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}
            required
          />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!selectedPersonal || requiresDisciplinaryReferral || (!!selectedPersonal.transferRequired && !isHistoricalMode)} className="w-full" icon={Icons.check({ size: 18 })}>
            {requiresDisciplinaryReferral ? "Remitir a Régimen Disciplinario" : "Registrar Sanción"}
          </Button>
        </form>
      </Card>

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar Registro de Sanción"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleConfirmRegister} loading={busy} icon={Icons.check({ size: 16 })}>Confirmar Registro</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--warning-50)] border border-[var(--warning-100)]">
            {Icons.alertTriangle({ size: 20, className: "text-[var(--warning-600)] flex-shrink-0" })}
            <p className="text-sm text-[var(--warning-600)]">Revise los datos antes de confirmar. Esta acción quedará registrada en el sistema de auditoría.</p>
          </div>
          <div className="grid gap-3">
            {isHistoricalMode && (
              <div className="p-3 rounded-xl bg-[var(--info-50)] border border-[var(--info-100)]">
                <p className="text-xs text-[var(--info-600)]">Tipo de registro</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">Histórico</p>
                <p className="mt-1 text-xs text-[var(--info-600)]">La unidad actual del efectivo no será modificada.</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-[var(--navy-50)]">
              <p className="text-xs text-[var(--navy-400)]">Efectivo</p>
              <p className="text-sm font-semibold text-[var(--navy-900)]">{selectedPersonal?.nombreCompleto}</p>
              <p className="text-xs text-[var(--navy-500)]">CI: {selectedPersonal?.ci}</p>
            </div>
            {isHistoricalMode && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                  <p className="text-xs text-[var(--navy-400)]">Unidad sancionadora</p>
                  <p className="text-sm font-semibold text-[var(--navy-900)]">{getUnitName(selectedUnitId)}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                  <p className="text-xs text-[var(--navy-400)]">Unidad histórica del efectivo</p>
                  <p className="text-sm font-semibold text-[var(--navy-900)]">{getUnitName(historicalDutyUnitId)}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Tipificación</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">{selectedArticle?.label.split(" - ")[0]}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Memorándum/Acta</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">{form.memorandum}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--navy-50)]">
              <p className="text-xs text-[var(--navy-400)]">Inciso</p>
              <p className="text-xs text-[var(--navy-700)]">{form.inciso}</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
