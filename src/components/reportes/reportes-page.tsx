"use client";

import { useCallback, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth, isGlobalRole } from "@/hooks/use-auth";
import { useDataCache } from "@/hooks/use-data-cache";
import { useUnidades } from "@/hooks/use-unidades";

type ReporteData = {
  periodo: string;
  totalFaltas: number;
  porArticulo: { articulo: string; count: number }[];
  porUnidad: { unidadNombre: string; count: number }[];
  reincidencias: number;
  reincidenciasBloqueadas?: number;
};

export function ReportesPage() {
  const { get } = useApi();
  const { sessionUser } = useAuth();
  const { fetchWithCache } = useDataCache();
  const { unitOptions: rawUnitOptions } = useUnidades();
  const isGlobal = isGlobalRole(sessionUser?.role ?? "");

  const [unidadId, setUnidadId] = useState(isGlobal ? "" : (sessionUser?.unidadId ?? ""));
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [fechaFin, setFechaFin] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReporteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unitOptions = [{ value: "", label: "Todas las unidades" }, ...rawUnitOptions];

  const fetchReport = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (unidadId) params.set("unidadId", unidadId);
      params.set("fechaInicio", fechaInicio);
      params.set("fechaFin", fechaFin);
      const cacheKey = `reportes:unidad:${unidadId || "todas"}:desde:${fechaInicio}:hasta:${fechaFin}`;
      const res = await fetchWithCache(
        cacheKey,
        () => get<ReporteData>(`/api/reportes?${params}`),
        { ttlMs: 10 * 60 * 1000, force: options?.force },
      );
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  }, [fetchWithCache, get, unidadId, fechaInicio, fechaFin]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Generar Reporte</h3>
        <div className="grid gap-4 md:grid-cols-4">
          {isGlobal && (
            <Select label="Unidad" value={unidadId} onChange={(e) => setUnidadId(e.target.value)} options={unitOptions} />
          )}
          <Input label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          <Input label="Hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          <div className="flex items-end">
            <Button variant="primary" onClick={() => { void fetchReport(); }} loading={loading} icon={Icons.reportes({ size: 16 })} className="w-full">Generar</Button>
          </div>
        </div>
        {data && (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => { void fetchReport({ force: true }); }} loading={loading}>
              Actualizar reporte
            </Button>
          </div>
        )}
      </Card>

      {loading && <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>}

      {error && !loading && (
        <Card className="p-5 border-[var(--danger-100)] bg-[var(--danger-50)]">
          <div className="flex items-start gap-3">
            <div className="text-[var(--danger-600)]">{Icons.alertTriangle({ size: 20 })}</div>
            <div>
              <p className="text-sm font-semibold text-[var(--danger-600)]">No se pudo generar el reporte.</p>
              <p className="mt-1 text-sm text-[var(--danger-600)]">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-[var(--navy-900)]">{data.totalFaltas}</p>
              <p className="text-xs text-[var(--navy-400)] mt-1">Total Sanciones</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-[var(--danger-600)]">{data.reincidenciasBloqueadas ?? data.reincidencias}</p>
              <p className="text-xs text-[var(--navy-400)] mt-1">Reincidencias Bloqueadas</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-[var(--info-600)]">{data.porUnidad?.length ?? 0}</p>
              <p className="text-xs text-[var(--navy-400)] mt-1">Unidades</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* By Article */}
            <Card className="p-5">
              <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Por Artículo</h3>
              {data.porArticulo.length > 0 ? (
                <div className="space-y-3">
                  {data.porArticulo.map((item) => {
                    const max = Math.max(...data.porArticulo.map((a) => a.count), 1);
                    const pct = Math.round((item.count / max) * 100);
                    const color = item.articulo.includes("9") ? "bg-[var(--warning-500)]" : item.articulo.includes("10") ? "bg-[var(--info-500)]" : "bg-[var(--danger-500)]";
                    return (
                      <div key={item.articulo}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-[var(--navy-700)]">{item.articulo}</span>
                          <span className="text-sm font-bold">{item.count}</span>
                        </div>
                        <div className="h-2 bg-[var(--navy-100)] rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%`, transition: "width 0.7s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="Sin datos" />}
            </Card>

            {/* By Unit */}
            <Card className="p-5">
              <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Por Unidad</h3>
              {data.porUnidad.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {data.porUnidad.sort((a, b) => b.count - a.count).map((item) => (
                    <div key={item.unidadNombre} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--navy-50)]">
                      <span className="text-sm text-[var(--navy-700)] truncate mr-2">{item.unidadNombre}</span>
                      <Badge variant="gold">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="Sin datos" />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
