"use client";

import { FormEvent, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";

export function ForcePasswordChange() {
  const { firebaseUser, sessionUser, refreshSession, logout } = useAuth();
  const { post } = useApi();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!firebaseUser?.email) {
      setError("No se pudo validar la sesion actual.");
      return;
    }

    if (newPassword.length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("La confirmacion no coincide con la nueva contrasena.");
      return;
    }

    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      await post("/api/users/password-change", {});
      await refreshSession();
    } catch {
      setError("No se pudo cambiar la contrasena. Verifique la contrasena temporal e intente nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 md:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-600)]">
            Primer ingreso
          </p>
          <h1 className="mt-2 text-xl font-bold text-[var(--navy-900)]">
            Cambie su contrasena temporal
          </h1>
          <p className="mt-2 text-sm text-[var(--navy-500)]">
            Para continuar en el sistema debe definir una contrasena personal.
          </p>
          {sessionUser?.email && (
            <p className="mt-3 text-xs text-[var(--navy-400)]">{sessionUser.email}</p>
          )}
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Contrasena temporal"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label="Nueva contrasena"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <Input
            label="Confirmar nueva contrasena"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />

          {error && (
            <div className="rounded-xl border border-[var(--danger-100)] bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-600)]">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            Guardar contrasena
          </Button>
          <Button type="button" variant="ghost" onClick={logout} className="w-full">
            Cerrar sesion
          </Button>
        </form>
      </Card>
    </main>
  );
}
