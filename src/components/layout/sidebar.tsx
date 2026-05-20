"use client";

import Image from "next/image";
import { Icons } from "@/components/ui/icons";
import { Badge } from "@/components/ui/primitives";
import { useAuth, isGlobalRole, isSuperAdmin } from "@/hooks/use-auth";
import { canRegisterFalta } from "@/lib/domain/roles";

export type ModuleKey = "dashboard" | "registro" | "personal" | "historial" | "usuarios" | "unidades" | "importacion" | "reportes" | "transferencias" | "solicitudes";

type SidebarProps = {
  activeModule: ModuleKey;
  onNavigate: (module: ModuleKey) => void;
  collapsed?: boolean;
};

type NavItem = {
  key: ModuleKey;
  label: string;
  icon: (p?: { size?: number }) => React.ReactNode;
  requiredRole?: (role: string) => boolean;
};

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: Icons.dashboard },
  { key: "registro", label: "Registro de Falta", icon: Icons.registro, requiredRole: canRegisterFalta },
  { key: "personal", label: "Personal", icon: Icons.usuarios },
  { key: "historial", label: "Historial", icon: Icons.historial },
  { key: "usuarios", label: "Usuarios", icon: Icons.usuarios, requiredRole: isGlobalRole },
  { key: "unidades", label: "Unidades", icon: Icons.building, requiredRole: isGlobalRole },
  { key: "importacion", label: "Importar Personal", icon: Icons.importar, requiredRole: isGlobalRole },
  { key: "reportes", label: "Reportes", icon: Icons.reportes },
  { key: "transferencias", label: "Auditoría Traspasos", icon: Icons.historial, requiredRole: isGlobalRole },
  { key: "solicitudes", label: "Dejar sin Efecto", icon: Icons.alertTriangle, requiredRole: isGlobalRole },
];

export function Sidebar({ activeModule, onNavigate, collapsed = false }: SidebarProps) {
  const { sessionUser, logout } = useAuth();
  const role = sessionUser?.role ?? "";

  const visibleItems = navItems.filter(
    (item) => !item.requiredRole || item.requiredRole(role),
  );

  return (
    <aside
      className={`
        hidden lg:flex flex-col flex-shrink-0
        bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]
        rounded-2xl overflow-hidden
        transition-all duration-300
        ${collapsed ? "w-[72px]" : "w-[280px]"}
      `}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-white/20 flex items-center justify-center">
            <Image
              src="/escudo-policia-boliviana.png"
              alt="Escudo Policia Boliviana"
              width={24}
              height={24}
              className="object-contain translate-y-[1px]"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">Control Disciplinario</h2>
              <p className="text-xs text-[var(--navy-400)] truncate">Sistema Institucional</p>
              <p className="text-[11px] text-[var(--navy-500)] mt-1 leading-tight">
                Comando Departamental de Policía
                <br />
                Chuquisaca
              </p>
            </div>
          )}
        </div>
      </div>

      {/* User info */}
      {!collapsed && sessionUser && (
        <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl bg-white/5">
          <p className="text-xs text-[var(--navy-400)] truncate">{sessionUser.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isSuperAdmin(role) ? "gold" : "default"}>
              {role.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm
                transition-all duration-200
                ${isActive
                  ? "bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)] font-semibold"
                  : "text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white"
                }
              `}
            >
              <span className={`flex-shrink-0 ${isActive ? "text-[var(--gold-400)]" : ""}`}>
                {item.icon({ size: 20 })}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Unit */}
      {!collapsed && sessionUser?.unidadNombre && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-white/5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--navy-500)]">Unidad</p>
          <p className="text-xs text-[var(--navy-300)] truncate">{sessionUser.unidadNombre}</p>
        </div>
      )}

      {/* Logout */}
      <div className="p-3 mt-2">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--navy-400)] hover:bg-[var(--danger-500)]/10 hover:text-[var(--danger-500)] transition-all duration-200"
        >
          {Icons.logout({ size: 20 })}
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
