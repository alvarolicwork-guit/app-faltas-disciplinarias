"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { ImportarSancionesHistoricas } from "@/components/registro/importar-sanciones-historicas";
import { ResumenSancion } from "@/components/registro/resumen-sancion";
import { SancionesRelacionadas } from "@/components/historial/sanciones-relacionadas";
import { useApi, ApiError } from "@/hooks/use-api";
import { useAuth, isUnitScopedRole } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { DISCIPLINARY_CATALOG } from "@/lib/domain/disciplinary-catalog";
import {
  canBulkImportHistoricalSanctions,
  canRegisterHistoricalFalta,
} from "@/lib/domain/roles";
import { isReincidenciaEscalada } from "@/lib/domain/disciplinary-recidivism";
import { boliviaToday, type ChainMetadata, type Conduct } from "@/lib/domain/recurrence-chain";
import { formatDisciplinaryDate, type ReincidenciaOrigenView } from "@/lib/domain/reincidencia-format";
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

type Evaluation = { tipo:"base"|"escalada"|"remision"; periodoAnteriorVencido?:boolean; conductaOrigen:Conduct; sancion:{articulo:string;inciso:string;remisionMensaje?:string}; antecedenteId:string|null; metadata:ChainMetadata|null; reincidenciaOrigen:ReincidenciaOrigenView; bloqueo:string|null; disponible:boolean; decisionVersion:string; pruebaLocalSinEspera?:boolean };
type RegistrationPayload = { personalId:string;unidadId:string;articulo:string;inciso:string;fechaSancion:string;memorandum:string;motivo:string;modoRegistro:string;reincidenciaOrigen:{articuloBase:string;incisoBase:string;faltaReferenciaId:string}|null;decisionVersion:string };

export function RegistroPage() {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { invalidate } = useDataCache();
  const { unitOptions } = useUnidades();
  const toast = useToast();

  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [registroMode, setRegistroMode] = useState<"actual" | "historico">("actual");
  const [personalRows, setPersonalRows] = useState<Personal[]>([]);
  const [personalNextOffset, setPersonalNextOffset] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedPersonalId, setSelectedPersonalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [intentionAccepted, setIntentionAccepted] = useState(false);
  const [evaluationResult,setEvaluationResult]=useState<{key:string;data:Evaluation}|null>(null);
  const [evaluationLoading,setEvaluationLoading]=useState(false);
  const [evaluationError,setEvaluationError]=useState("");
  const [evaluationGeneration,setEvaluationGeneration]=useState(0);
  const [pendingRegistration,setPendingRegistration]=useState<RegistrationPayload|null>(null);

  const [form, setForm] = useState({
    articuloId: "",
    inciso: "",
    fechaSancion: boliviaToday(),
    memorandum: "",
    motivo: "",
  });

  const canSelectUnit = sessionUser ? !isUnitScopedRole(sessionUser.role) : false;
  const canUseHistoricalMode = sessionUser ? canRegisterHistoricalFalta(sessionUser.role) : false;
  const canUseBulkHistoricalImport = sessionUser
    ? canBulkImportHistoricalSanctions(sessionUser.role)
    : false;
  const isHistoricalMode = canUseHistoricalMode && registroMode === "historico";
  const effectiveUnitId = canSelectUnit ? selectedUnitId : (sessionUser?.unidadId ?? "");
  const personalSearchUnitId = "";

  const selectedPersonal = useMemo(() => personalRows.find((r) => r.id === selectedPersonalId) ?? null, [personalRows, selectedPersonalId]);
  const selectedArticle = useMemo(() => DISCIPLINARY_CATALOG.find((a) => a.id === form.articuloId) ?? null, [form.articuloId]);
  const evaluationKey = JSON.stringify([selectedPersonalId,form.articuloId,form.inciso,form.fechaSancion,evaluationGeneration]);
  const evaluation = evaluationResult?.key===evaluationKey?evaluationResult.data:null;
  const sanctionDocumentPrefix = getSanctionDocumentPrefix(evaluation?.sancion.articulo ?? selectedArticle?.id ?? "");
  const requiresDisciplinaryReferral = evaluation?.tipo === "remision";
  const sanctionUnitOptions = useMemo(
    () => [{ value: "", label: "Todas las unidades" }, ...unitOptions],
    [unitOptions],
  );

  const refreshPersonal = useCallback(async (q = "", _unidad = effectiveUnitId, offset = 0) => {
    void _unidad;
    if (!q.trim()) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("scope", "catalogo");
    params.set("offset", String(offset));
    const query = params.toString() ? `?${params}` : "";
    try {
      const payload = await get<{ data: Personal[]; nextOffset: number | null }>(`/api/personal${query}`);
      setPersonalRows(previous => offset ? [...previous, ...payload.data] : payload.data);
      setPersonalNextOffset(payload.nextOffset);
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
  }

  function handleRegistroModeChange(mode: "actual" | "historico") {
    setRegistroMode(mode);
    setSelectedUnitId("");
    setSearchText("");
    setSelectedPersonalId("");
    setPersonalRows([]);
  }

  function handleArticleChange(articleId: string) {
    setForm((prev) => ({
      ...prev,
      articuloId: articleId,
      inciso: "",
      memorandum: articleId ? formatSanctionDocumentNumber(articleId, prev.memorandum) : "",
    }));
  }

  function handleMemorandumChange(value: string) {
    if (!selectedArticle) {
      setForm((prev) => ({ ...prev, memorandum: extractSanctionDocumentNumber(value) }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      memorandum: formatSanctionDocumentNumber(evaluation?.sancion.articulo ?? selectedArticle.id, value),
    }));
  }

  function handleIncisoChange(inciso:string) { setForm(prev=>({...prev,inciso})); }

  useEffect(()=>{
    let cancelled=false;
    if(!selectedPersonalId||!selectedArticle||!form.inciso||!form.fechaSancion)return;
    void(async()=>{
      setEvaluationLoading(true);setEvaluationError("");
      try {
        const data=await post<Evaluation>("/api/faltas/evaluar",{personalId:selectedPersonalId,articulo:selectedArticle.label,inciso:form.inciso,fechaSancion:form.fechaSancion});
        if(!cancelled){setEvaluationResult({key:evaluationKey,data});setForm(prev=>({...prev,memorandum:formatSanctionDocumentNumber(data.sancion.articulo,prev.memorandum)}));}
      } catch(error){if(!cancelled){setEvaluationResult(null);setEvaluationError(error instanceof Error?error.message:"No se pudo evaluar la conducta");}}
      finally{if(!cancelled)setEvaluationLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[selectedPersonalId,selectedArticle,form.inciso,form.fechaSancion,evaluationKey,post]);

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
    if (!selectedArticle || !form.inciso) { toast.warning("Seleccione artículo e inciso"); return; }
    if (!evaluation || evaluationLoading) { toast.warning("Espere la evaluación de antecedentes"); return; }
    if (!evaluation.disponible) { toast.warning("Registro no disponible",evaluation.bloqueo??evaluation.sancion.remisionMensaje??"Revise el fundamento"); return; }
    if (!form.memorandum.trim() || !selectedArticle || !isValidSanctionDocumentNumber(evaluation.sancion.articulo, form.memorandum)) {
      toast.warning("Ingrese el número de memorándum/Acta", `Formato esperado: ${sanctionDocumentPrefix}001/2026`);
      return;
    }
    if (!form.motivo.trim()) { toast.warning("Ingrese el motivo disciplinario"); return; }
    const origin=evaluation.reincidenciaOrigen;
    setPendingRegistration({personalId:selectedPersonal.id,unidadId:effectiveUnitId,articulo:evaluation.sancion.articulo,inciso:evaluation.sancion.inciso,fechaSancion:form.fechaSancion,memorandum:form.memorandum,motivo:form.motivo,modoRegistro:isHistoricalMode?"historico":"actual",reincidenciaOrigen:origin?.faltaReferenciaId?{articuloBase:origin.articuloBase!,incisoBase:origin.incisoBase!,faltaReferenciaId:origin.faltaReferenciaId}:null,decisionVersion:evaluation.decisionVersion});
    setIntentionAccepted(false);
    setConfirmOpen(true);
  }

  async function handleConfirmRegister() {
    setConfirmOpen(false);
    setBusy(true);
    try {
      if(!pendingRegistration||!intentionAccepted) return;
      const payload=pendingRegistration;
      const { confirmationId } = await post<{ confirmationId: string }>("/api/confirmaciones", { action: "registrar_sancion", payload, acepta: true });
      await post("/api/faltas", { ...payload, payloadConfirmado: payload, confirmationId });
      toast.success("Sanción registrada", "El registro se guardó correctamente.");
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("reportes:");
      setForm((prev) => ({ ...prev, inciso: "", memorandum: "", motivo: "" }));
      setSelectedPersonalId("");
    } catch (err) {
      if(err instanceof ApiError && err.status===409)setEvaluationGeneration(n=>n+1);
      toast.error("No se pudo registrar",err instanceof Error?err.message:"Revise la evaluación actualizada");
    } finally {
      setBusy(false);
    }
  }

  const articleOptions = DISCIPLINARY_CATALOG.filter(a=>a.id!=="art12").map((a) => ({ value: a.id, label: a.label }));
  const incisoOptions = selectedArticle?.incisos.filter(inc=>!isReincidenciaEscalada(selectedArticle.label,inc)).map((inc) => ({ value: inc, label: inc })) ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      {canUseHistoricalMode && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--navy-900)]">Tipo de registro</h3>
              <p className="text-sm text-[var(--navy-500)]">
                Use histórico para documentar sanciones anteriores en su unidad sancionadora.
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
                  La unidad sancionadora conservará este registro en su historial.
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

              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] last:border-b-0 transition-colors ${selectedPersonalId === row.id ? "bg-[var(--gold-50)] border-l-2 border-l-[var(--gold-500)]" : "hover:bg-[var(--navy-50)]"}`}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--navy-100)] flex items-center justify-center flex-shrink-0">
                {Icons.user({ size: 14, className: "text-[var(--navy-500)]" })}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--navy-900)] truncate">{row.nombreCompleto}</p>
                <p className="text-xs text-[var(--navy-400)]">CI {row.ci}</p>

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
      {personalNextOffset !== null && <Button onClick={() => { void refreshPersonal(searchText, "", personalNextOffset); }}>Cargar más resultados del padrón</Button>}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Datos de la Sanción</h3>
        <form className="space-y-4" onSubmit={handlePreSubmit}>
          {evaluationLoading && <p role="status">Buscando sanciones anteriores por esta misma falta...</p>}
          {evaluationError && <p role="alert" className="text-red-700">{evaluationError}</p>}
          {evaluation && <ResumenSancion evaluation={evaluation} fechaSancion={form.fechaSancion} />}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Artículo de la falta cometida"
              value={form.articuloId}
              onChange={(e) => handleArticleChange(e.target.value)}
              options={articleOptions}
              placeholder="Seleccionar artículo"
              required
            />
            <Select
              label="Inciso de la falta cometida"
              value={form.inciso}
              onChange={(e) => handleIncisoChange(e.target.value)}
              options={incisoOptions}
              placeholder="Seleccionar inciso"
              disabled={!selectedArticle}
              required
            />
          </div>
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
              max={boliviaToday()}
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
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!selectedPersonal || evaluationLoading || !evaluation?.disponible || requiresDisciplinaryReferral} className="w-full" icon={Icons.check({ size: 18 })}>
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
            <label className="text-sm"><input type="checkbox" checked={intentionAccepted} onChange={e => setIntentionAccepted(e.target.checked)} /> Confirmo mi intención de registrar esta sanción.</label>
            <Button variant="primary" disabled={!intentionAccepted} onClick={handleConfirmRegister} loading={busy} icon={Icons.check({ size: 16 })}>Confirmar Registro</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2 p-3 rounded-xl bg-[var(--warning-50)] border border-[var(--warning-100)]">
            {Icons.alertTriangle({ size: 20, className: "text-[var(--warning-600)] flex-shrink-0" })}
            <p className="text-sm text-[var(--warning-600)]">Revise los datos antes de confirmar. Esta acción quedará registrada en el sistema de auditoría.</p>
            <p className="text-sm"><strong>Unidad sancionadora:</strong> {unitOptions.find(u => u.value === effectiveUnitId)?.label ?? sessionUser?.unidadNombre ?? effectiveUnitId}</p>
            <p className="text-sm"><strong>Fecha de sanción:</strong> {formatDisciplinaryDate(form.fechaSancion)}</p>
            <p className="text-sm"><strong>Motivo:</strong> {form.motivo}</p>
            {evaluation?.reincidenciaOrigen && <SancionesRelacionadas origin={evaluation.reincidenciaOrigen} />}
          </div>
          <div className="grid gap-3">
            {isHistoricalMode && (
              <div className="p-3 rounded-xl bg-[var(--info-50)] border border-[var(--info-100)]">
                <p className="text-xs text-[var(--info-600)]">Tipo de registro</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">Histórico</p>
                <p className="mt-1 text-xs text-[var(--info-600)]">El policía pertenece al padrón departamental general.</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-[var(--navy-50)]">
              <p className="text-xs text-[var(--navy-400)]">Efectivo</p>
              <p className="text-sm font-semibold text-[var(--navy-900)]">{selectedPersonal?.nombreCompleto}</p>
              <p className="text-xs text-[var(--navy-500)]">CI: {selectedPersonal?.ci}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Sanción que corresponde registrar</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">{pendingRegistration?.articulo.split(" - ")[0]}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Memorándum/Acta</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">{form.memorandum}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--navy-50)]">
              <p className="text-xs text-[var(--navy-400)]">Inciso</p>
              <p className="text-xs text-[var(--navy-700)]">{pendingRegistration?.inciso}</p>
              {pendingRegistration?.reincidenciaOrigen && <p className="mt-2 text-xs">Falta cometida: {selectedArticle?.label} / {form.inciso}</p>}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
