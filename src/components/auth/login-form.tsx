"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/primitives";

export function LoginForm() {
  const { login, error, clearError, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    clearError();
    try {
      await login(email, password);
    } catch {
      /* error is set by auth context */
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Spinner size={36} />
          <p className="text-sm text-[var(--navy-400)]">Verificando sesión…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center min-h-screen px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--gold-400)]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[var(--navy-500)]/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in-up">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white border border-[var(--border)] flex items-center justify-center shadow-sm mb-4">
            <Image
              src="/escudo-policia-boliviana.png"
              alt="Escudo de la Policia Boliviana"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-[var(--navy-900)]">Control Disciplinario</h1>
          <p className="text-sm text-[var(--navy-500)] mt-1">Sistema Institucional de Faltas Disciplinarias</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-lg p-6 md:p-8">
          <h2 className="text-lg font-bold text-[var(--navy-900)] mb-1">Ingreso institucional</h2>
          <p className="text-sm text-[var(--navy-500)] mb-6">Ingrese con las credenciales asignadas por su administrador.</p>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@institucion.gob"
              icon={Icons.user({ size: 16 })}
              required
              autoComplete="email"
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--danger-50)] border border-[var(--danger-100)] animate-fade-in">
                {Icons.alertCircle({ size: 16, className: "text-[var(--danger-500)] flex-shrink-0 mt-0.5" })}
                <p className="text-sm text-[var(--danger-600)]">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full mt-2">
              Iniciar sesión
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--navy-400)] mt-6">
          Policía Nacional — Departamento Disciplinario
        </p>
      </div>
    </main>
  );
}
