export type PoliceUnit = {
  id: string;
  nombre: string;
};

/**
 * @deprecated Use `useUnidades` hook instead to fetch from Firestore.
 * This array is only kept as a fallback for the seed script.
 */
export const POLICE_UNITS: PoliceUnit[] = [
  { id: "U-001", nombre: "Direccion Departamental de Bomberos" },
  { id: "U-002", nombre: "Direccion Departamental de la FELCC" },
  { id: "U-003", nombre: "Direccion Departamental de la FELCV" },
  { id: "U-004", nombre: "Direccion Departamental de DIPROVE" },
  { id: "U-005", nombre: "Direccion Departamental de POFOMA" },
  {
    id: "U-006",
    nombre: "Direccion Departamental de Transito Transporte y seguridad vial",
  },
  { id: "U-007", nombre: "Direccion Departamental de Derechos Humanos" },
  { id: "U-008", nombre: "Unidad Tactica de Operaciones Policiales UTOP" },
  { id: "U-009", nombre: "Grupo Accion y Reaccion Delta DELTA" },
  { id: "U-010", nombre: "Radio Patrullas 110" },
  { id: "U-011", nombre: "Unidad de CANES" },
  { id: "U-012", nombre: "Grupo de Apoyo civil a la Policia GACIP" },
  { id: "U-013", nombre: "Policia rural y Fronteriza" },
  { id: "U-014", nombre: "Recinto penitenciario de San Roque" },
  { id: "U-015", nombre: "Patrulla de Auxilio y Cooperacion Ciudadana PAC" },
  { id: "U-016", nombre: "Estacion Policial de Integral de San Roque" },
  { id: "U-017", nombre: "Estacion Policial de Integral de Patacon" },
  { id: "U-018", nombre: "Estacion Policial de Integral de villa Armonia" },
  { id: "U-019", nombre: "Policia Turistica" },
  { id: "U-020", nombre: "Departamento de Inteligencia" },
  { id: "U-021", nombre: "Conciliacion Ciudadana" },
];

/**
 * @deprecated Use `useUnidades().getUnitName()` instead.
 */
export function getUnitNameById(unidadId: string): string {
  return POLICE_UNITS.find((unit) => unit.id === unidadId)?.nombre ?? unidadId;
}
