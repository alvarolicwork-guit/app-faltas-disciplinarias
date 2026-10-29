import { resolveRangoPolicial } from "@/lib/domain/rangos-policiales";
import { ciKey, normalizeCi, normalizePersonName } from "@/lib/domain/text-normalization";
export type PersonalImportError = {row:number;field:string;message:string;value?:string;suggestion?:string};
export function preparePersonalRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return rows.map((row,index) => {
    const errors: PersonalImportError[] = [];
    const add=(field:string,message:string)=>errors.push({row:index+2,field,message,value:String(row[field]??"").slice(0,200)});
    for (const key of ["ci","grado","nombres","apellidos","sexo"]) if (!String(row[key]??"").trim()) add(key,key+" es requerido");
    const ci=normalizeCi(String(row.ci??"")), key=ciKey(ci);
    if (!ci) add("ci","CI inválido");
    if (seen.has(key)) add("ci","CI duplicado dentro del archivo");
    if (ci) seen.add(key);
    const normalized=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
    const sexo=({masculino:"Masculino",femenino:"Femenino"} as Record<string,string>)[normalized(row.sexo)];
    const estado=normalized(row.estado)||"activo";
    if (!sexo) add("sexo","Use Masculino o Femenino");
    if (!["activo","baja","comision"].includes(estado)) add("estado","Use activo, baja o comision");
    const rank=resolveRangoPolicial(String(row.grado??""));
    if (!rank.ok) add("grado","Grado policial no reconocido");
    const nombres=normalizePersonName(String(row.nombres??"")), apellidos=normalizePersonName(String(row.apellidos??""));
    if (nombres.length>200 || apellidos.length>200 || ci.length>100) add("nombres","Los datos exceden la longitud permitida");
    const grado=rank.ok?rank.gradoFinal:"";
    return {rowNumber:index+2, errors, normalized:errors.length?null:{ci,grado,gradoOriginal:String(row.grado),gradoMetodoResolucion:rank.ok?rank.metodo:"",nombres,apellidos,nombreCompleto:(grado+" "+nombres+" "+apellidos).trim(),sexo,estado}};
  });
}
