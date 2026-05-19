"use client";

import { useState, type ReactNode } from "react";
import { Sidebar, type ModuleKey } from "./sidebar";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";

type AppShellProps = {
  activeModule: ModuleKey;
  onNavigate: (module: ModuleKey) => void;
  children: ReactNode;
};

export function AppShell({ activeModule, onNavigate, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block p-3 pr-0">
        <Sidebar activeModule={activeModule} onNavigate={onNavigate} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-[var(--navy-900)]/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            style={{ animation: "modal-backdrop 0.2s ease-out both" }}
          />
          <div className="relative w-[280px] h-full" style={{ animation: "slide-in-right 0.3s var(--ease-out) both" }}>
            <Sidebar activeModule={activeModule} onNavigate={(m) => { onNavigate(m); setMobileMenuOpen(false); }} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-3 p-3 min-w-0 pb-20 lg:pb-3">
        <Header activeModule={activeModule} onMenuToggle={() => setMobileMenuOpen(true)} />
        <div className="flex-1 animate-fade-in">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileNav activeModule={activeModule} onNavigate={onNavigate} />
    </div>
  );
}

export type { ModuleKey };
