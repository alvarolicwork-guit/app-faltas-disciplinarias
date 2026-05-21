"use client";

import { useCallback, useEffect, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, EmptyState, Badge } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth, isGlobalRole } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-unidades";
import { useDataCache } from "@/hooks/use-data-cache";

type DashboardStats = {
  totalFaltas: number;
  faltasMes: number;
  reincidencias: number;
  reincidenciasBloqueadas?: number;
  unidadesActivas: number;
  porArticulo: { articulo: string; count: number }[];
  recientes: { id: string; nombreCompleto: string; articulo: string; fechaSancion: string; unidadSancionNombre: string }[];
};

export function DashboardPage() {
  const { get } = useApi();
  const { sessionUser } = useAuth();
  const { fetchWithCache } = useDataCache();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const { unidades } = useUnidades();

  const isGlobal = isGlobalRole(sessionUser?.role ?? "");
  const unitId = sessionUser?.unidadId ?? "";

  const fetchStats = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    try {
      const params = unitId && !isGlobal ? `?unidadId=${unitId}` : "";
      const cacheKey = `dashboard:${isGlobal ? "global" : unitId || "sin-unidad"}`;
      const result = await fetchWithCache(
        cacheKey,
        () => get<DashboardStats>(`/api/dashboard${params}`),
        { ttlMs: 2 * 60 * 1000, force: options?.force },
      );
      setStats(result.data);
      setLastUpdatedAt(result.storedAt);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [fetchWithCache, get, unitId, isGlobal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStats();
  }, [fetchStats]);

  if (loading) return <DashboardSkeleton />;

  const kpis = [
    { label: "Total Sanciones", value: stats?.totalFaltas ?? 0, icon: Icons.fileText, color: "from-[var(--navy-700)] to-[var(--navy-900)]", textColor: "text-white" },
    { label: "Este Mes", value: stats?.faltasMes ?? 0, icon: Icons.calendar, color: "from-[var(--gold-400)] to-[var(--gold-600)]", textColor: "text-[var(--navy-900)]" },
    { label: "Reincidencias Bloqueadas", value: stats?.reincidenciasBloqueadas ?? stats?.reincidencias ?? 0, icon: Icons.alertTriangle, color: "from-[var(--danger-500)] to-red-700", textColor: "text-white" },
    { label: isGlobal ? "Unidades Activas" : "Personal", value: isGlobal ? (stats?.unidadesActivas ?? 0) : (stats?.totalFaltas ?? 0), icon: Icons.building, color: "from-[var(--info-500)] to-blue-700", textColor: "text-white" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void fetchStats({ force: true }); }}
          loading={loading}
          icon={Icons.reportes({ size: 14 })}
        >
          {lastUpdatedAt ? "Actualizar datos" : "Actualizar"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl bg-gradient-to-br ${kpi.color} p-4 md:p-5 shadow-md`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-xs font-medium ${kpi.textColor} opacity-80`}>{kpi.label}</p>
                <p className={`text-2xl md:text-3xl font-bold ${kpi.textColor} mt-1 animate-count-up`}>{kpi.value}</p>
              </div>
              <div className={`${kpi.textColor} opacity-30`}>{kpi.icon({ size: 28 })}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Distribution chart */}
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Distribución por Artículo</h3>
          {stats?.porArticulo && stats.porArticulo.length > 0 ? (
            <div className="space-y-3">
              {stats.porArticulo.map((item) => {
                const maxCount = Math.max(...stats.porArticulo.map((a) => a.count), 1);
                const pct = Math.round((item.count / maxCount) * 100);
                const label = item.articulo.includes("Art. 9") ? "Art. 9 — Leves" : item.articulo.includes("Art. 10") ? "Art. 10 — Medias" : "Art. 11 — Graves";
                const barColor = item.articulo.includes("Art. 9") ? "bg-[var(--warning-500)]" : item.articulo.includes("Art. 10") ? "bg-[var(--info-500)]" : "bg-[var(--danger-500)]";
                return (
                  <div key={item.articulo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--navy-700)]">{label}</span>
                      <span className="text-sm font-bold text-[var(--navy-900)]">{item.count}</span>
                    </div>
                    <div className="h-2.5 bg-[var(--navy-100)] rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Sin datos" description="No hay sanciones registradas aún." />
          )}
        </Card>

        {/* Recent sanctions */}
        <Card className="p-5">
          <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Últimas Sanciones</h3>
          {stats?.recientes && stats.recientes.length > 0 ? (
            <div className="space-y-3">
              {stats.recientes.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-[var(--navy-50)] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-[var(--navy-100)] flex items-center justify-center flex-shrink-0 text-[var(--navy-500)]">
                    {Icons.user({ size: 14 })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--navy-800)] truncate">{item.nombreCompleto}</p>
                    <p className="text-xs text-[var(--navy-400)]">{item.fechaSancion}</p>
                  </div>
                  <Badge variant={item.articulo.includes("11") ? "danger" : item.articulo.includes("10") ? "warning" : "info"}>
                    {item.articulo.includes("11") ? "Art.11" : item.articulo.includes("10") ? "Art.10" : "Art.9"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin sanciones" description="No hay sanciones registradas." />
          )}
        </Card>
      </div>

      {/* Units quick access for global roles */}
      {isGlobal && (
        <Card className="p-5">
          <h3 className="text-base font-bold text-[var(--navy-900)] mb-4">Unidades Policiales</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {unidades.map((unit) => (
              <div key={unit.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--border)] hover:border-[var(--gold-500)] hover:bg-[var(--gold-50)] transition-all cursor-default">
                <div className="w-8 h-8 rounded-lg bg-[var(--navy-100)] flex items-center justify-center flex-shrink-0">
                  {Icons.building({ size: 14, className: "text-[var(--navy-500)]" })}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--navy-400)]">{unit.id}</p>
                  <p className="text-xs font-medium text-[var(--navy-800)] truncate">{unit.nombre}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-24 rounded-2xl" />))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
