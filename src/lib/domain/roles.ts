export function isUnitScopedRole(role: string): boolean {
  return role === "operador_unidad" || role === "admin_unidad";
}

export function isGlobalRole(role: string): boolean {
  return role === "admin_dpto" || role === "super_admin";
}

export function canReadGlobalInfo(role: string): boolean {
  return role === "visor_dpto" || role === "admin_dpto" || role === "super_admin";
}

export function canViewGlobalPersonHistory(role: string): boolean {
  return role === "visor_dpto" || role === "super_admin";
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

export function canViewUsers(role: string): boolean {
  return role === "admin_dpto" || role === "super_admin";
}

export function canCreateUsers(role: string): boolean {
  return role === "super_admin";
}

export function canDeactivateUsers(role: string): boolean {
  return role === "super_admin";
}

export function canHandoverUnitUsers(role: string): boolean {
  return role === "admin_dpto" || role === "super_admin";
}

export function canEditUserRole(role: string): boolean {
  return role === "admin_dpto" || role === "super_admin";
}

export function canManageSuperAdmin(role: string): boolean {
  return role === "super_admin";
}
