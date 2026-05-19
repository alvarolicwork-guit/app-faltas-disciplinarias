export const APP_NAME = "Registro y Control de Faltas Disciplinarias";

export const USER_ROLES = [
  "operador_unidad",
  "admin_unidad",
  "admin_dpto",
  "super_admin",
] as const;

export const USER_ROLES_CAN_REGISTER_FALTA = new Set<string>([
  "admin_unidad",
  "admin_dpto",
  "super_admin",
]);
export const USER_ROLES_GLOBAL = new Set<string>(["admin_dpto", "super_admin"]);
export const USER_ROLES_UNIT_SCOPE = new Set<string>([
  "operador_unidad",
  "admin_unidad",
]);
export const USER_ROLES_CAN_WRITE_PERSONAL = new Set<string>([
  "admin_dpto",
  "super_admin",
]);

export const FALTA_ESTADOS = ["registrada", "anulada"] as const;

export const PERSONAL_ESTADOS = ["activo", "baja", "comision"] as const;

export const REINCIDENCIA_WINDOW_DAYS = 365;
