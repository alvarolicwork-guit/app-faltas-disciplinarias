export type PoliceUnit = {
  id: string;
  nombre: string;
};

/**
 * @deprecated Use `useUnidades` hook instead to fetch from Firestore.
 * This array is only kept as a fallback for the seed script.
 */
export const POLICE_UNITS: PoliceUnit[] = [
  { id: "U-001", nombre: "COMANDO DEPARTAMENTAL" },
  { id: "U-002", nombre: "SUB-COMANDO DEPARTAMENTAL" },
  { id: "U-003", nombre: "INSPECTORIA DEPARTAMENTAL" },
  { id: "U-004", nombre: "DPTO. \"I\" PERSONAL" },
  { id: "U-005", nombre: "DPTO. II INTELIGENCIA" },
  { id: "U-006", nombre: "DPTO. \"III\" PLANEAMIENTO Y OPERACIONES" },
  { id: "U-007", nombre: "DPTO. \"IV\" ADMINISTRATIVA" },
  { id: "U-008", nombre: "DIR. DPTAL. INTERPOL" },
  { id: "U-009", nombre: "TRIBUNAL DISCIPLINARIO" },
  { id: "U-010", nombre: "FISCALIA POLICIAL" },
  { id: "U-011", nombre: "DIR. DPTAL. DE INV. POLICIAL INTERNA DIDIPI" },
  { id: "U-012", nombre: "DIR. SALUD Y BIENESTAR SOCIAL" },
  { id: "U-013", nombre: "DIR. DPTAL. DIPROVE" },
  { id: "U-014", nombre: "DIR. DPTAL. FELCC." },
  { id: "U-015", nombre: "DIR.DPTAL. FISC. Y RECAUDACIONES" },
  { id: "U-016", nombre: "DIR.DPTAL.DE SEG. PENITENCIARIA SAN ROQUE" },
  { id: "U-017", nombre: "DIR.DPTAL. DE DERECHOS HUMANOS" },
  { id: "U-018", nombre: "UNIDAD TACTICA DE OP. UTOP" },
  { id: "U-019", nombre: "CONCILIACION CIUDADANA" },
  { id: "U-020", nombre: "BANDA DE M\u00daSICA" },
  { id: "U-021", nombre: "PATRULLA DE AUX. Y COOP. CIUDADANA" },
  { id: "U-022", nombre: "U.P.A.R. DELTA" },
  { id: "U-023", nombre: "DIR DPTAL DE BOMBEROS" },
  { id: "U-024", nombre: "CENTRO DE CANES C.A.C." },
  { id: "U-025", nombre: "POLICIA TURISTICA" },
  { id: "U-026", nombre: "DIR. DPTAL. F. E. L. C. V." },
  { id: "U-027", nombre: "COMISION CMDO AL BAT SEG FIS PRIVADA" },
  { id: "U-028", nombre: "DIR. DPTAL. TRANSITO, TRANS. SEG. VIAL" },
  { id: "U-029", nombre: "POLICIA RURAL Y FRONTERIZA" },
  { id: "U-030", nombre: "U.T.E.P.P.I." },
  { id: "U-031", nombre: "DIR. DPTAL. POFOMA" },
  { id: "U-032", nombre: "DIR.DPTAL.GESTION ESTRATEGICA" },
  { id: "U-033", nombre: "IITCUP" },
  { id: "U-034", nombre: "DIR. DPTAL. SERV. TEC. AUXILIARES" },
  { id: "U-035", nombre: "DEPARTAMENTO JURIDICO" },
  { id: "U-036", nombre: "DIR. DPTAL. SERVICIO AEREO POLICIAL" },
  { id: "U-037", nombre: "DEPARTAMENTO DE JEDECEV" },
  { id: "U-038", nombre: "EPI No. 1 SAN ROQUE" },
  { id: "U-039", nombre: "EPI No. 2 VILLA ARMONIA" },
  { id: "U-040", nombre: "EPI No. 3 PATACON" },
  { id: "U-041", nombre: "RADIO PATRULLAS 110" },
  { id: "U-042", nombre: "GUARDIA MUNICIPAL" },
  { id: "U-043", nombre: "G.A.C.I.P GRUPO DE APOYO CIVIL A LA POLICIA" },
];

/**
 * @deprecated Use `useUnidades().getUnitName()` instead.
 */
export function getUnitNameById(unidadId: string): string {
  return POLICE_UNITS.find((unit) => unit.id === unidadId)?.nombre ?? unidadId;
}