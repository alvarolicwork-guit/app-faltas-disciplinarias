"use client";

import { useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ToastProvider } from "@/hooks/use-toast";
import { LoginForm } from "@/components/auth/login-form";
import { ForcePasswordChange } from "@/components/auth/force-password-change";
import { AppShell, type ModuleKey } from "@/components/layout/app-shell";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { RegistroPage } from "@/components/registro/registro-page";
import { HistorialPage } from "@/components/historial/historial-page";
import { PersonalPage } from "@/components/personal/personal-page";
import { UsuariosPage } from "@/components/usuarios/usuarios-page";
import { ImportPage } from "@/components/importacion/import-page";
import { ReportesPage } from "@/components/reportes/reportes-page";
import { UnidadesPage } from "@/components/unidades/unidades-page";
import { TransferenciasPage } from "@/components/transferencias/transferencias-page";
import { SolicitudesPage } from "@/components/solicitudes/solicitudes-page";
import { UnidadesProvider } from "@/hooks/use-unidades";
import { DataCacheProvider } from "@/hooks/use-data-cache";
import { Spinner } from "@/components/ui/primitives";

function AppRouter() {
  const { sessionUser, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Spinner size={36} />
          <p className="text-sm text-[var(--navy-400)]">Cargando sistema…</p>
        </div>
      </main>
    );
  }

  if (!sessionUser) {
    return <LoginForm />;
  }

  if (sessionUser.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  const moduleMap: Record<ModuleKey, React.ReactNode> = {
    dashboard: <DashboardPage />,
    registro: <RegistroPage />,
    personal: <PersonalPage />,
    historial: <HistorialPage />,
    usuarios: <UsuariosPage />,
    unidades: <UnidadesPage />,
    importacion: <ImportPage />,
    reportes: <ReportesPage />,
    transferencias: <TransferenciasPage />,
    solicitudes: <SolicitudesPage />,
  };

  return (
    <AppShell activeModule={activeModule} onNavigate={setActiveModule}>
      {moduleMap[activeModule]}
    </AppShell>
  );
}

export function DisciplinarioApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        <DataCacheProvider>
          <UnidadesProvider>
            <AppRouter />
          </UnidadesProvider>
        </DataCacheProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
