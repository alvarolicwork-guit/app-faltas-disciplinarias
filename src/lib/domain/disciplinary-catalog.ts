export type DisciplinaryArticle = {
  id: "art9" | "art10" | "art11" | "art12";
  label: string;
  incisos: string[];
};

export const DISCIPLINARY_CATALOG: DisciplinaryArticle[] = [
  {
    id: "art9",
    label: "Art. 9 - Faltas leves con llamada de atencion verbal",
    incisos: [
      "1. Negligencia en el aseo personal, descuido en la limpieza del vestuario o uso incorrecto del uniforme.",
      "2. No presentarse con el uniforme reglamentario previsto para los diferentes actos del servicio.",
      "3. Omitir el saludo, no responder o hacerlo con desaire, vistiendo uniforme.",
      "4. No utilizar el marbete de identificacion personal en el uniforme.",
      "5. Ingresar a otras Unidades y Organismos Operativos sin identificarse ante el Oficial o Superior de Servicio Interno.",
      "6. Omitir el parte de cortesia al superior.",
      "7. No observar el horario establecido para el cumplimiento de sus funciones.",
      "8. Dejacion momentanea e injustificada de las funciones publicas policiales.",
      "9. No guardar el respeto y consideracion entre miembros de la institucion.",
      "10. Demostrar falta de cortesia con el publico.",
      "11. No identificarse a requerimiento del superior, estando de uniforme o de servicio.",
    ],
  },
  {
    id: "art10",
    label: "Art. 10 - Llamada de atencion escrita y arresto de 1 a 3 dias",
    incisos: [
      "1. Reincidencia de una de las faltas del articulo anterior.",
      "2. Demorar deliberadamente la tramitacion de solicitudes elevadas reglamentariamente.",
      "3. Negligencia en el desempeno de las funciones asignadas.",
      "4. Fingir enfermedad u otros problemas para rehuir obligaciones.",
      "5. Encubrir faltas leves.",
      "6. No prestar apoyo o cooperacion a los miembros de la institucion en labores policiales.",
      "7. Desconocer la autoridad del servidor publico policial, faltandole al respeto en actos del servicio.",
      "8. Efectuar llamada de atencion a otro servidor policial de forma despectiva.",
      "9. Dirigirse al superior de forma agresiva o despectiva, demostrando mala conducta o insubordinacion.",
      "10. No presentarse a las citaciones como testigo en un proceso disciplinario interno sin causa justificada.",
      "11. Omitir la elaboracion de informes policiales en el dia de su actuacion o requerimiento.",
      "12. Inobservancia del conducto regular al elevar solicitudes.",
      "13. No cumplir instructivas administrativas internas de cada unidad.",
      "14. Exhibirse en manifestaciones indecorosas de forma publica, estando de uniforme.",
      "15. Presentarse al cumplimiento de funciones con aliento alcoholico.",
      "16. Hacer uso de su descanso sin el relevo correspondiente o sin autorizacion superior.",
    ],
  },
  {
    id: "art11",
    label: "Art. 11 - Llamada de atencion escrita y arresto de 4 a 10 dias",
    incisos: [
      "1. Reincidencia de una de las faltas del articulo 10 o de las del articulo 9.",
      "2. No observar normas de seguridad en la tenencia, transporte, portacion y manipulacion de armas de fuego.",
      "3. Utilizar marbetes de identificacion de otro servidor policial dentro del recinto policial.",
      "4. Incumplimiento a instrucciones superiores, salvo que sean contrarias a las normas o hayan sido objetadas.",
      "5. Utilizar al servidor publico policial en actividades ajenas al servicio.",
      "6. Faltar a la verdad al elevar informes o partes, siempre que no trasciendan al ambito interno.",
      "7. Inobservancia del deber de cuidado o perdida de prendas, equipo y materiales de la institucion bajo su responsabilidad.",
      "8. Exhibirse publicamente de uniforme en actos que menoscaben el prestigio institucional.",
      "9. No realizar la accion directa conforme a procedimiento.",
      "10. Interferir en la accion directa o investigaciones efectuadas por el personal responsable.",
      "11. Modificar, desautorizar o suspender arbitrariamente la sancion impuesta por otro superior.",
      "12. Inasistencia o abandono injustificado por un dia (sancion de 4 a 5 dias de arresto).",
      "13. Inasistencia o abandono injustificado por dos dias continuos (sancion de 5 a 10 dias de arresto).",
      "14. Contravenir disposiciones de Auto de Buen Gobierno.",
      "15. No cumplir la funcion policial por dedicarse a actividades particulares estando de servicio.",
      "16. Presentar memoriales o solicitudes sin el respeto que merecen las autoridades institucionales.",
      "17. Inobservancia de procedimientos en la custodia de arrestados y aprehendidos.",
      "18. Negarse a prestar auxilio a personas que lo soliciten, salvo causa justificada.",
      "19. No transmitir oportunamente las ordenes superiores.",
      "20. No dar respuesta a los requerimientos del Fiscal Policial en el tiempo senalado.",
      "21. Agredirse fisica o verbalmente entre miembros de la institucion en cumplimiento de funciones.",
      "22. Perdida o deterioro de correspondencia oficial.",
    ],
  },
  {
    id: "art12",
    label: "Art. 12 - Faltas graves con retiro temporal de tres meses a un año",
    incisos: [
      "1. Reincidencia de una de las faltas del articulo anterior.",
    ],
  },
];
