"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { useApi, ApiError } from "@/hooks/use-api";
import { useAuth, isGlobalRole, isUnitScopedRole } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-unidades";
import { useToast } from "@/hooks/use-toast";
import { DISCIPLINARY_CATALOG, type DisciplinaryArticle } from "@/lib/domain/disciplinary-catalog";
import {
  getArticuloBaseForSancionEscalada,
  isReincidenciaEscalada,
  sameArticulo,
} from "@/lib/domain/disciplinary-recidivism";

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
};

type ReincidenciaOrigenState = {
  articuloBase: string;
  incisoBase: string;
  faltaReferenciaId: string;
} | null;

export function RegistroPage() {
  const { get, post } = useApi();
  const { sessionUser } = useAuth();
  const { unitOptions, getUnitName } = useUnidades();
  const toast = useToast();

  const [selectedUnitId, setSelectedUnitId] = useState("");
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

  const [form, setForm] = useState({
    articuloId: "",
    inciso: "",
    fechaSancion: new Date().toISOString().slice(0, 10),
    memorandum: "",
    motivo: "",
  });

  const canSelectUnit = sessionUser ? !isUnitScopedRole(sessionUser.role) : false;
  const isGlobalActor = sessionUser ? isGlobalRole(sessionUser.role) : false;
  const effectiveUnitId = canSelectUnit ? selectedUnitId : (sessionUser?.unidadId ?? "");

  const selectedPersonal = useMemo(() => personalRows.find((r) => r.id === selectedPersonalId) ?? null, [personalRows, selectedPersonalId]);
  const selectedArticle = useMemo(() => DISCIPLINARY_CATALOG.find((a) => a.id === form.articuloId) ?? null, [form.articuloId]);
  const isSancionEscalada = selectedArticle ? isReincidenciaEscalada(selectedArticle.label, form.inciso) : false;
  const articuloBaseEsperado = selectedArticle ? getArticuloBaseForSancionEscalada(selectedArticle.label, form.inciso) : null;

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
    if (!effectiveUnitId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPersonal("", effectiveUnitId);
  }, [effectiveUnitId, refreshPersonal]);

  function handleSearchPersonal(e: FormEvent) {
    e.preventDefault();
    void (async () => {
      const result = await refreshPersonal(searchText, effectiveUnitId);
      if (result && !result.ok) {
        toast.error("Error al buscar personal", result.message);
      }
    })();
  }

  function handleUnitChange(unitId: string) {
    setSelectedUnitId(unitId);
    setSelectedPersonalId("");
    setPersonalRows([]);
    setTransferTargetUnitId("");
    setOrigenRows([]);
    setReincidenciaOrigen(null);
  }

  function getArticleIdByLabel(label: string): DisciplinaryArticle["id"] | "" {
    return DISCIPLINARY_CATALOG.find((article) => label.includes(article.label.split(" - ")[0]))?.id ?? "";
  }

  function handleArticleChange(articleId: string) {
    setForm((prev) => ({ ...prev, articuloId: articleId, inciso: "" }));
    setOrigenRows([]);
    setReincidenciaOrigen(null);
  }

  function handleIncisoChange(inciso: string) {
    setForm((prev) => ({ ...prev, inciso }));
    setOrigenRows([]);
    setReincidenciaOrigen(null);

    if (selectedArticle && selectedPersonal && isReincidenciaEscalada(selectedArticle.label, inciso)) {
      const base = getArticuloBaseForSancionEscalada(selectedArticle.label, inciso);
      if (base) void refreshOrigenRows(selectedPersonal.id, base);
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

  const refreshOrigenRows = useCallback(async (personalId: string, articuloBase: string) => {
    if (!personalId || !articuloBase) {
      setOrigenRows([]);
      return;
    }

    setOrigenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("personalId", personalId);
      params.set("estado", "registrada");
      const payload = await get<{ data: FaltaOrigen[] }>(`/api/faltas?${params}`);
      setOrigenRows(payload.data.filter((row) => sameArticulo(row.articulo, articuloBase)));
    } catch {
      setOrigenRows([]);
    } finally {
      setOrigenLoading(false);
    }
  }, [get]);

  function handlePreSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPersonal) { toast.warning("Seleccione un efectivo"); return; }
    if (!effectiveUnitId) { toast.warning("Seleccione la unidad"); return; }
    if (!selectedArticle || !form.inciso) { toast.warning("Seleccione artículo e inciso"); return; }
    if (isSancionEscalada && !reincidenciaOrigen) {
      toast.warning("Seleccione la falta del artículo anterior que origina la reincidencia");
      return;
    }
    if (!form.memorandum.trim()) { toast.warning("Ingrese el número de memorándum"); return; }
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
        reincidenciaOrigen,
      });
      toast.success("Sanción registrada", "El registro se guardó correctamente.");
      setForm((prev) => ({ ...prev, inciso: "", memorandum: "", motivo: "" }));
      setSelectedPersonalId("");
      setOrigenRows([]);
      setReincidenciaOrigen(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const payload = err.payload as {
          referencia?: { memorandum?: string; fechaSancion?: string; unidadNombre?: string };
          sancionSugerida?: { articulo: string; inciso: string };
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
        }
        toast.error(
          "Reincidencia detectada",
          `Debe registrar la sanción superior ${payload.sancionSugerida?.articulo?.split(" - ")[0] ?? "correspondiente"} inciso 1. Memo previo: ${ref?.memorandum ?? "N/A"} (${ref?.fechaSancion?.slice(0, 10) ?? "N/A"}).`,
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
      {/* Unit selector */}
      <Card className="p-5">
        {canSelectUnit ? (
          <Select
            label="Unidad que impone la sanción"
            value={selectedUnitId}
            onChange={(e) => handleUnitChange(e.target.value)}
            options={unitOptions}
            placeholder="Seleccionar unidad"
          />
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
                if (selectedArticle && form.inciso && isReincidenciaEscalada(selectedArticle.label, form.inciso)) {
                  const base = getArticuloBaseForSancionEscalada(selectedArticle.label, form.inciso);
                  if (base) void refreshOrigenRows(row.id, base);
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
            <EmptyState title="Sin resultados" description={effectiveUnitId ? "Busque por nombre o CI." : "Seleccione una unidad primero."} />
          )}
        </div>
      </Card>

      {/* Fault form */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Datos de la Sanción</h3>
        {selectedPersonal?.transferRequired && (
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
        {isGlobalActor && selectedPersonal && (
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
                  Esta sanción debe referir la falta previa del {articuloBaseEsperado?.split(" - ")[0] ?? "artículo anterior"} que fue reincidida.
                </p>
              </div>
              <Select
                label="Falta previa reincidida"
                value={reincidenciaOrigen?.faltaReferenciaId ?? ""}
                onChange={(e) => selectOrigen(e.target.value)}
                options={origenRows.map((row) => ({
                  value: row.id,
                  label: `${row.fechaSancion ?? ""} | ${row.articulo.split(" - ")[0]} | ${row.inciso} | ${row.memorandum}`,
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
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Fecha de sanción"
              type="date"
              value={form.fechaSancion}
              onChange={(e) => setForm((p) => ({ ...p, fechaSancion: e.target.value }))}
              required
            />
            <Input
              label="Número de memorándum"
              placeholder="Ej: MEMO-001/2026"
              value={form.memorandum}
              onChange={(e) => setForm((p) => ({ ...p, memorandum: e.target.value }))}
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
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!selectedPersonal || !!selectedPersonal.transferRequired} className="w-full" icon={Icons.check({ size: 18 })}>
            Registrar Sanción
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
            <div className="p-3 rounded-xl bg-[var(--navy-50)]">
              <p className="text-xs text-[var(--navy-400)]">Efectivo</p>
              <p className="text-sm font-semibold text-[var(--navy-900)]">{selectedPersonal?.nombreCompleto}</p>
              <p className="text-xs text-[var(--navy-500)]">CI: {selectedPersonal?.ci}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Tipificación</p>
                <p className="text-sm font-semibold text-[var(--navy-900)]">{selectedArticle?.label.split(" - ")[0]}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--navy-50)]">
                <p className="text-xs text-[var(--navy-400)]">Memorándum</p>
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
