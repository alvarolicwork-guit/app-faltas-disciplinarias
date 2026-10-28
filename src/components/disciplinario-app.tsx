"use client";

import { useState } from "react";
import { canReadCancellationRequests } from "@/lib/domain/roles";
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
import { AuditoriaPage } from "@/components/auditoria/auditoria-page";
import { Notificaciones } from "@/components/notificaciones/notificaciones";
import { SolicitudesPage } from "@/components/solicitudes/solicitudes-page";
import { UnidadesProvider } from "@/hooks/use-unidades";
import { DataCacheProvider } from "@/hooks/use-data-cache";
import { Spinner } from "@/components/ui/primitives";

function SessionRouter() {
  const { sessionUser, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [selectedRequestId, setSelectedRequestId] = useState<string | undefined>();
  function openRequests(id?: string) { setSelectedRequestId(id); setActiveModule("solicitudes"); }

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
    dashboard: <DashboardPage onOpenRequests={() => openRequests()} />,
    registro: <RegistroPage />,
    personal: <PersonalPage key={`${sessionUser.uid}:${sessionUser.role}:${sessionUser.unidadId}`} />,
    historial: <HistorialPage onOpenRequests={openRequests} />,
    usuarios: <UsuariosPage />,
    unidades: <UnidadesPage />,
    importacion: <ImportPage />,
    reportes: <ReportesPage />,
    transferencias: <p>Los traspasos de personal fueron retirados.</p>,
    auditoria: <AuditoriaPage />,
    solicitudes: canReadCancellationRequests(sessionUser.role) ? <SolicitudesPage key={selectedRequestId || "list"} selectedRequestId={selectedRequestId} onFindSanction={() => setActiveModule("historial")} /> : <p role="alert">No tiene permisos para consultar solicitudes.</p>,
  };

  return (
    <AppShell activeModule={activeModule} onNavigate={setActiveModule}>
      <Notificaciones />
      {moduleMap[activeModule]}
    </AppShell>
  );
}

function AppRouter() {
  const { sessionUser } = useAuth();
  return <SessionRouter key={sessionUser ? `${sessionUser.uid}:${sessionUser.role}:${sessionUser.unidadId || ""}` : "sin-sesion"} />;
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
