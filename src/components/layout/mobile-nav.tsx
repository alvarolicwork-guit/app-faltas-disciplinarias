"use client";

import { Icons } from "@/components/ui/icons";
import { useAuth, isGlobalRole } from "@/hooks/use-auth";
import { canRegisterFalta } from "@/lib/domain/roles";
import type { ModuleKey } from "./sidebar";

type MobileNavProps = {
  activeModule: ModuleKey;
  onNavigate: (module: ModuleKey) => void;
};

type NavTab = {
  key: ModuleKey;
  label: string;
  icon: (p?: { size?: number }) => React.ReactNode;
  requiresGlobal?: boolean;
  requiredRole?: (role: string) => boolean;
};

const tabs: NavTab[] = [
  { key: "dashboard", label: "Inicio", icon: Icons.dashboard },
  { key: "registro", label: "Registro", icon: Icons.registro, requiredRole: canRegisterFalta },
  { key: "personal", label: "Personal", icon: Icons.usuarios },
  { key: "historial", label: "Historial", icon: Icons.historial },
  { key: "usuarios", label: "Usuarios", icon: Icons.usuarios, requiresGlobal: true },
  { key: "unidades", label: "Unidades", icon: Icons.building, requiresGlobal: true },
  { key: "reportes", label: "Reportes", icon: Icons.reportes },
  { key: "transferencias", label: "Traspasos", icon: Icons.historial, requiresGlobal: true },
  { key: "solicitudes", label: "Solicitudes", icon: Icons.alertTriangle, requiresGlobal: true },
];

export function MobileNav({ activeModule, onNavigate }: MobileNavProps) {
  const { sessionUser } = useAuth();
  const role = sessionUser?.role ?? "";

  const visibleTabs = tabs.filter(
    (t) => (!t.requiresGlobal || isGlobalRole(role)) && (!t.requiredRole || t.requiredRole(role)),
  );

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-[var(--border)] px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around">
        {visibleTabs.map((tab) => {
          const isActive = activeModule === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[56px] transition-colors ${isActive ? "text-[var(--gold-600)]" : "text-[var(--navy-400)]"}`}
            >
              <span className={`transition-transform ${isActive ? "scale-110" : ""}`}>
                {tab.icon({ size: 22 })}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && <span className="w-4 h-0.5 rounded-full bg-[var(--gold-500)] mt-0.5" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
