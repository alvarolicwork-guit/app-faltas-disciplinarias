"use client";

import { type ReactNode } from "react";
import { Icons } from "./icons";
import { Button } from "./button";
import { Modal } from "./modal";

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  loading?: boolean;
  icon?: ReactNode;
};

const variantConfig = {
  danger: {
    iconBg: "bg-[var(--danger-100)]",
    iconColor: "text-[var(--danger-600)]",
    defaultIcon: Icons.alertTriangle({ size: 24 }),
    buttonVariant: "danger" as const,
  },
  warning: {
    iconBg: "bg-[var(--warning-100)]",
    iconColor: "text-[var(--warning-600)]",
    defaultIcon: Icons.alertCircle({ size: 24 }),
    buttonVariant: "primary" as const,
  },
  default: {
    iconBg: "bg-[var(--info-100)]",
    iconColor: "text-[var(--info-600)]",
    defaultIcon: Icons.info({ size: 24 }),
    buttonVariant: "primary" as const,
  },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "¿Está seguro?",
  description = "Esta acción no se puede deshacer.",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  loading = false,
  icon,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center py-2">
        <div className={`w-14 h-14 rounded-2xl ${config.iconBg} ${config.iconColor} flex items-center justify-center mb-4`}>
          {icon ?? config.defaultIcon}
        </div>
        <p className="text-sm text-[var(--navy-600)] leading-relaxed max-w-xs">{description}</p>
      </div>
      <div className="flex items-center justify-center gap-3 mt-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={config.buttonVariant} onClick={onConfirm} loading={loading}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
