"use client";

import { useState } from "react";
import { Icons } from "@/components/ui/icons";
import { Button, Input, Modal, Badge, Card, EmptyState, Skeleton, ConfirmDialog } from "@/components/ui";
import { useApi, ApiError } from "@/hooks/use-api";
import { useDataCache } from "@/hooks/use-data-cache";
import { useToast } from "@/hooks/use-toast";
import { useUnidades, Unidad } from "@/hooks/use-unidades";

export function UnidadesPage() {
  const { unidades, loading, refresh } = useUnidades();
  const [searchTerm, setSearchTerm] = useState("");
  const { post, patch, del } = useApi();
  const { invalidate } = useDataCache();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnidad, setEditingUnidad] = useState<Unidad | null>(null);
  const [formData, setFormData] = useState({ nombre: "" });
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingUnidad, setDeletingUnidad] = useState<Unidad | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredUnidades = unidades.filter(u => 
    u.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenCreate = () => {
    setEditingUnidad(null);
    setFormData({ nombre: "" });
    setModalOpen(true);
  };

  const handleOpenEdit = (unidad: Unidad) => {
    setEditingUnidad(unidad);
    setFormData({ nombre: unidad.nombre });
    setModalOpen(true);
  };

  const handleOpenDelete = (unidad: Unidad) => {
    setDeletingUnidad(unidad);
    setConfirmOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    setSaving(true);
    try {
      if (editingUnidad) {
        await patch("/api/unidades", { id: editingUnidad.id, nombre: formData.nombre });
        toast.success("Unidad actualizada");
      } else {
        await post("/api/unidades", { nombre: formData.nombre });
        toast.success("Unidad creada");
      }
      setModalOpen(false);
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("personal:");
      await refresh();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : "Error al guardar";
      toast.error("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUnidad) return;

    setIsDeleting(true);
    try {
      await del(`/api/unidades?id=${deletingUnidad.id}`);
      toast.success("Unidad eliminada");
      setConfirmOpen(false);
      invalidate("dashboard:");
      invalidate("historial:");
      invalidate("personal:");
      await refresh();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : "Error al eliminar";
      toast.error("No se puede eliminar", msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--navy-900)]">Unidades Policiales</h2>
          <p className="text-sm text-[var(--navy-500)]">Gestión de unidades y divisiones organizacionales</p>
        </div>
        <Button onClick={handleOpenCreate} icon={Icons.plus({ size: 16 })}>
          Nueva Unidad
        </Button>
      </div>

      <Card className="p-4">
        {/* Toolbar */}
        <div className="mb-4">
          <Input
            icon={Icons.search({ size: 16 })}
            placeholder="Buscar por ID o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table/List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : filteredUnidades.length > 0 ? (
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[var(--navy-50)] text-[var(--navy-500)] font-medium">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3 w-full">Nombre de la Unidad</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredUnidades.map((unidad) => (
                    <tr key={unidad.id} className="hover:bg-[var(--navy-50)]/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--navy-800)]">{unidad.id}</td>
                      <td className="px-4 py-3 text-[var(--navy-900)] whitespace-normal">{unidad.nombre}</td>
                      <td className="px-4 py-3">
                        <Badge variant={unidad.estado === "activa" ? "success" : "default"}>
                          {unidad.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(unidad)}>
                          {Icons.edit({ size: 16 })}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleOpenDelete(unidad)}>
                          {Icons.trash({ size: 16 })}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Sin resultados"
            description={searchTerm ? "No se encontraron unidades con ese término." : "No hay unidades registradas."}
            icon={Icons.building({ size: 40 })}
          />
        )}
      </Card>

      {/* Modal Crear/Editar */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingUnidad ? "Editar Unidad" : "Nueva Unidad"}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Nombre de la Unidad"
            placeholder="Ej: Dirección Departamental..."
            value={formData.nombre}
            onChange={(e) => setFormData({ nombre: e.target.value })}
            required
            autoFocus
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !formData.nombre.trim()} loading={saving}>
              Guardar Unidad
            </Button>
          </div>
        </form>
      </Modal>

      {/* Dialog Eliminar */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !isDeleting && setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar Unidad"
        description={<>¿Estás seguro de que deseas eliminar la unidad <strong>{deletingUnidad?.nombre}</strong>? Esta acción no se puede deshacer y fallará si tiene personal o faltas asignadas.</>}
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
