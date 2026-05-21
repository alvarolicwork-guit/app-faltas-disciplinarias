"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUnidades } from "@/hooks/use-unidades";
import { USER_ROLES } from "@/lib/domain/constants";
import { RANGOS_POLICIALES } from "@/lib/domain/rangos-policiales";

type UserRow = {
  uid: string;
  email: string;
  displayName?: string;
  grado?: string;
  nombres?: string;
  apellidos?: string;
  nombreCompleto?: string;
  role: string;
  unidadId?: string;
  unidadNombre?: string;
  status?: string;
  isActive?: boolean;
};

export function UsuariosPage() {
  const { get, post, patch, del } = useApi();
  const { sessionUser } = useAuth();
  const { unitOptions, getUnitName } = useUnidades();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const [handover, setHandover] = useState({
    unidadId: "",
    role: "admin_unidad",
    incomingEmail: "",
    incomingDisplayName: "",
    incomingGrado: "",
    incomingNombres: "",
    incomingApellidos: "",
    temporaryPassword: "",
    reason: "",
  });

  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    grado: "",
    nombres: "",
    apellidos: "",
    role: "",
    unidadId: "",
    unidadNombre: "",
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<{ data: UserRow[] }>("/api/users");
      setUsers(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsers();
  }, [fetchUsers]);

  function openCreate() {
    setEditUser(null);
    setForm({
      email: "",
      password: "",
      displayName: "",
      grado: "",
      nombres: "",
      apellidos: "",
      role: "",
      unidadId: "",
      unidadNombre: "",
    });
    setModalOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditUser(user);
    setForm({
      email: user.email,
      password: "",
      displayName: user.displayName ?? "",
      grado: user.grado ?? "",
      nombres: user.nombres ?? "",
      apellidos: user.apellidos ?? "",
      role: user.role,
      unidadId: user.unidadId ?? "",
      unidadNombre: user.unidadNombre ?? "",
    });
    setModalOpen(true);
  }

  function openHandover() {
    setHandover({
      unidadId: "",
      role: "admin_unidad",
      incomingEmail: "",
      incomingDisplayName: "",
      incomingGrado: "",
      incomingNombres: "",
      incomingApellidos: "",
      temporaryPassword: "",
      reason: "",
    });
    setHandoverOpen(true);
  }

  function openDeactivate(user: UserRow) {
    setDeactivateTarget(user);
    setDeactivateReason("");
    setDeactivateOpen(true);
  }

  function closeDeactivate() {
    setDeactivateOpen(false);
    setDeactivateBusy(false);
    setDeactivateTarget(null);
    setDeactivateReason("");
  }

  function validateUserForm(): string | null {
    if (!editUser && !form.email.trim()) return "Ingrese el correo electronico";
    if (!editUser && form.password.length < 8) return "Ingrese una contrasena de al menos 8 caracteres";
    if (!form.grado) return "Seleccione el grado";
    if (!form.nombres.trim()) return "Ingrese nombres";
    if (!form.apellidos.trim()) return "Ingrese apellidos";
    if (!form.role) return "Seleccione el rol";
    if (needsUnit && !form.unidadId) return "Seleccione la unidad";
    return null;
  }

  async function saveUser() {
    const validationError = validateUserForm();
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    setBusy(true);
    try {
      const unitName = getUnitName(form.unidadId);
      if (editUser) {
        await patch(`/api/users?uid=${editUser.uid}`, {
          role: form.role,
          unidadId: form.unidadId,
          unidadNombre: unitName,
          displayName: form.displayName,
          grado: form.grado,
          nombres: form.nombres,
          apellidos: form.apellidos,
        });
        toast.success("Usuario actualizado");
      } else {
        await post("/api/users", {
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          grado: form.grado,
          nombres: form.nombres,
          apellidos: form.apellidos,
          role: form.role,
          unidadId: form.unidadId,
          unidadNombre: unitName,
        });
        toast.success("Usuario creado");
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveUser();
  }

  async function handleHandover() {
    if (
      !handover.unidadId ||
      !handover.role ||
      !handover.incomingEmail.trim() ||
      !handover.incomingGrado ||
      !handover.incomingNombres.trim() ||
      !handover.incomingApellidos.trim()
    ) {
      toast.warning("Complete unidad, rol, correo, grado, nombres y apellidos del entrante");
      return;
    }

    if (handover.reason.trim().length < 10) {
      toast.warning("El motivo del relevo debe tener al menos 10 caracteres");
      return;
    }

    setHandoverBusy(true);
    try {
      await post("/api/users/handover", {
        unidadId: handover.unidadId,
        unidadNombre: getUnitName(handover.unidadId),
        role: handover.role,
        incomingEmail: handover.incomingEmail,
        incomingDisplayName: handover.incomingDisplayName,
        incomingGrado: handover.incomingGrado,
        incomingNombres: handover.incomingNombres,
        incomingApellidos: handover.incomingApellidos,
        temporaryPassword: handover.temporaryPassword,
        reason: handover.reason,
      });

      toast.success("Relevo ejecutado", "Se activó la cuenta entrante y se bloqueó la saliente.");
      setHandoverOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo ejecutar el relevo");
    } finally {
      setHandoverBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;

    if (deactivateReason.trim().length < 10) {
      toast.warning("El motivo de baja debe tener al menos 10 caracteres");
      return;
    }

    setDeactivateBusy(true);
    try {
      await del(`/api/users?uid=${deactivateTarget.uid}`, {
        reason: deactivateReason.trim(),
      });
      toast.success("Usuario dado de baja", "El acceso fue deshabilitado y sus sesiones fueron revocadas.");
      closeDeactivate();
      fetchUsers();
    } catch (err) {
      toast.error("Error", err instanceof Error ? err.message : "No se pudo dar de baja el usuario");
    } finally {
      setDeactivateBusy(false);
    }
  }

  const roleOptions = USER_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }));
  const rankOptions = RANGOS_POLICIALES.map((rank) => ({ value: rank, label: rank }));
  const needsUnit = form.role === "operador_unidad" || form.role === "admin_unidad";
  const isSuperAdmin = sessionUser?.role === "super_admin";

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[var(--navy-900)]">Usuarios del Sistema</h3>
            <p className="text-sm text-[var(--navy-400)]">{users.length} usuarios registrados</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={Icons.usuarios({ size: 16 })} onClick={openHandover}>Relevar Usuario</Button>
            <Button variant="primary" icon={Icons.plus({ size: 16 })} onClick={openCreate}>Crear Usuario</Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={Icons.usuarios({ size: 40 })} title="Sin usuarios" description="Cree el primer usuario del sistema." action={<Button variant="primary" onClick={openCreate}>Crear Usuario</Button>} />
        ) : (
          <div className="overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--navy-50)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Funcionario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--navy-500)] uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-[var(--navy-50)] transition-colors">
                    <td className="px-4 py-3 text-[var(--navy-700)]">{u.email}</td>
                    <td className="px-4 py-3 text-[var(--navy-800)] font-medium">{u.nombreCompleto ?? u.displayName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "super_admin" ? "gold" : u.role === "admin_dpto" ? "info" : "default"}>
                        {u.role.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--navy-600)] max-w-[200px] truncate">{u.unidadNombre ?? "Global"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.status === "activo" ? "success" : u.status === "baja" ? "default" : "warning"}>{u.status ?? "activo"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} icon={Icons.edit({ size: 14 })}>Editar</Button>
                        {isSuperAdmin && u.uid !== sessionUser?.uid && u.status !== "baja" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeactivate(u)}
                            icon={Icons.alertTriangle({ size: 14 })}
                            className="text-[var(--danger-600)] hover:text-[var(--danger-600)] hover:bg-[var(--danger-50)]"
                          >
                            Dar de baja
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        title="Relevo Seguro de Usuario"
        footer={
          <>
            <Button variant="outline" onClick={() => setHandoverOpen(false)} disabled={handoverBusy}>Cancelar</Button>
            <Button variant="primary" onClick={() => { void handleHandover(); }} loading={handoverBusy}>Ejecutar relevo</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void handleHandover(); }}>
          <Select
            label="Rol a relevar"
            value={handover.role}
            onChange={(e) => setHandover((p) => ({ ...p, role: e.target.value }))}
            options={[
              { value: "admin_unidad", label: "admin unidad" },
              { value: "operador_unidad", label: "operador unidad" },
            ]}
            required
          />
          <Select
            label="Unidad"
            value={handover.unidadId}
            onChange={(e) => setHandover((p) => ({ ...p, unidadId: e.target.value }))}
            options={unitOptions}
            placeholder="Seleccionar unidad"
            required
          />
          <Input
            label="Correo del funcionario entrante"
            type="email"
            value={handover.incomingEmail}
            onChange={(e) => setHandover((p) => ({ ...p, incomingEmail: e.target.value }))}
            placeholder="ejemplo@policia.gob.bo"
            required
          />
          <Input
            label="Nombre del funcionario entrante (opcional)"
            value={handover.incomingDisplayName}
            onChange={(e) => setHandover((p) => ({ ...p, incomingDisplayName: e.target.value }))}
            placeholder="Ej: My. Juan Perez"
          />
          <Select
            label="Grado del funcionario entrante"
            value={handover.incomingGrado}
            onChange={(e) => setHandover((p) => ({ ...p, incomingGrado: e.target.value }))}
            options={rankOptions}
            placeholder="Seleccionar grado"
            required
          />
          <Input
            label="Nombres del funcionario entrante"
            value={handover.incomingNombres}
            onChange={(e) => setHandover((p) => ({ ...p, incomingNombres: e.target.value }))}
            placeholder="Ej: Juan Carlos"
            required
          />
          <Input
            label="Apellidos del funcionario entrante"
            value={handover.incomingApellidos}
            onChange={(e) => setHandover((p) => ({ ...p, incomingApellidos: e.target.value }))}
            placeholder="Ej: Perez Rojas"
            required
          />
          <Input
            label="Contrasena temporal si la cuenta no existe"
            type="password"
            value={handover.temporaryPassword}
            onChange={(e) => setHandover((p) => ({ ...p, temporaryPassword: e.target.value }))}
            placeholder="Min. 8 caracteres"
            minLength={8}
          />
          <Textarea
            label="Motivo administrativo del relevo"
            value={handover.reason}
            onChange={(e) => setHandover((p) => ({ ...p, reason: e.target.value }))}
            placeholder="Describa la razón formal del cambio de responsable..."
            rows={3}
            error={handover.reason.trim().length > 0 && handover.reason.trim().length < 10 ? "Mínimo 10 caracteres" : undefined}
          />
          <p className="text-xs text-[var(--navy-500)]">
            Al confirmar, la cuenta saliente quedará bloqueada y sus sesiones serán revocadas por seguridad.
          </p>
        </form>
      </Modal>

      <Modal
        open={deactivateOpen}
        onClose={closeDeactivate}
        title="Dar de baja usuario"
        footer={
          <>
            <Button variant="outline" onClick={closeDeactivate} disabled={deactivateBusy}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => { void handleDeactivate(); }}
              loading={deactivateBusy}
              disabled={deactivateReason.trim().length < 10}
            >
              Confirmar baja
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--danger-100)] bg-[var(--danger-50)] p-3">
            <p className="text-sm font-semibold text-[var(--danger-600)]">
              Esta acción quitará el acceso del usuario.
            </p>
            <p className="mt-1 text-xs text-[var(--danger-600)]">
              La cuenta quedará deshabilitada, sus sesiones serán revocadas y el historial se conservará para auditoría.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-50)] p-3">
            <p className="text-xs text-[var(--navy-400)]">Usuario</p>
            <p className="text-sm font-semibold text-[var(--navy-900)]">
              {deactivateTarget?.nombreCompleto ?? deactivateTarget?.displayName ?? "Sin nombre"}
            </p>
            <p className="text-xs text-[var(--navy-600)]">{deactivateTarget?.email}</p>
            <p className="mt-1 text-xs text-[var(--navy-500)]">
              Rol: {deactivateTarget?.role?.replace(/_/g, " ")} | Unidad: {deactivateTarget?.unidadNombre ?? "Global"}
            </p>
          </div>

          <Textarea
            label="Motivo de baja"
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder="Ej.: Cambio de destino, baja administrativa o corrección de cuenta..."
            rows={4}
            error={deactivateReason.trim().length > 0 && deactivateReason.trim().length < 10 ? "Mínimo 10 caracteres" : undefined}
          />
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editUser ? "Editar Usuario" : "Crear Usuario"}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { void saveUser(); }} loading={busy}>{editUser ? "Guardar" : "Crear"}</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
          {!editUser && (
            <>
              <Input
                label="Correo electrónico"
                type="email"
                name="new-user-email"
                placeholder="ejemplo@policia.gob.bo"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
              <Input
                label="Contraseña"
                type="password"
                name="new-user-password"
                placeholder="Min. 8 caracteres"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
            </>
          )}
          <Input
            label="Nombre de visualización (opcional)"
            placeholder="Ej: Tte. Juan Perez"
            autoComplete="off"
            value={form.displayName}
            onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
          />
          <Select
            label="Grado"
            value={form.grado}
            onChange={(e) => setForm((p) => ({ ...p, grado: e.target.value }))}
            options={rankOptions}
            placeholder="Seleccionar grado"
            required
          />
          <Input
            label="Nombres"
            placeholder="Ej: Juan Carlos"
            autoComplete="off"
            value={form.nombres}
            onChange={(e) => setForm((p) => ({ ...p, nombres: e.target.value }))}
            required
          />
          <Input
            label="Apellidos"
            placeholder="Ej: Perez Rojas"
            autoComplete="off"
            value={form.apellidos}
            onChange={(e) => setForm((p) => ({ ...p, apellidos: e.target.value }))}
            required
          />
          <Select label="Rol" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} options={roleOptions} placeholder="Seleccionar rol" required />
          {needsUnit && (
            <Select label="Unidad" value={form.unidadId} onChange={(e) => setForm((p) => ({ ...p, unidadId: e.target.value }))} options={unitOptions} placeholder="Seleccionar unidad" required />
          )}
        </form>
      </Modal>
    </div>
  );
}
