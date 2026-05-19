"use client";

import { Icons } from "@/components/ui/icons";
import { useAuth } from "@/hooks/use-auth";
import type { ModuleKey } from "./sidebar";

const titles: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  registro: "Registro de Falta",
  personal: "Personal por Unidad",
  historial: "Historial de Sanciones",
  usuarios: "Gestión de Usuarios",
  unidades: "Unidades Policiales",
  importacion: "Importar Personal",
  reportes: "Reportes Estadísticos",
  transferencias: "Auditoría de Traspasos",
  solicitudes: "Solicitudes de Baja",
};

type HeaderProps = {
  activeModule: ModuleKey;
  onMenuToggle: () => void;
};

export function Header({ activeModule, onMenuToggle }: HeaderProps) {
  const { sessionUser } = useAuth();

  const initials = sessionUser?.email?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <header className="flex items-center gap-4 px-4 md:px-6 py-3 bg-white/80 backdrop-blur-lg border border-[var(--border)] rounded-2xl shadow-sm">
      {/* Mobile menu */}
      <button type="button" onClick={onMenuToggle} className="lg:hidden p-2 rounded-xl hover:bg-[var(--navy-100)] transition-colors" aria-label="Menú">
        {Icons.menu({ size: 22 })}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-[var(--navy-900)] truncate">{titles[activeModule]}</h1>
        {sessionUser?.unidadNombre && (
          <p className="text-xs text-[var(--navy-400)] truncate lg:hidden">{sessionUser.unidadNombre}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <div className="hidden md:block text-right">
          <p className="text-sm font-medium text-[var(--navy-800)] truncate max-w-[200px]">{sessionUser?.email}</p>
          <p className="text-xs text-[var(--navy-400)]">{sessionUser?.role?.replace(/_/g, " ")}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--gold-400)] to-[var(--gold-600)] flex items-center justify-center text-sm font-bold text-[var(--navy-900)] shadow-sm">
          {initials}
        </div>
      </div>
    </header>
  );
}
