export function isUnitScopedRole(role: string): boolean {
  return role === "operador_unidad" || role === "admin_unidad";
}

export function isGlobalRole(role: string): boolean {
  return role === "admin_dpto" || role === "super_admin";
}

export function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

export function canManageTransfers(role: string): boolean {
  return role === "admin_unidad" || role === "admin_dpto" || role === "super_admin";
}

export function canRegisterFalta(role: string): boolean {
  return role === "admin_unidad" || role === "admin_dpto" || role === "super_admin";
}
