import { DocumentData, Firestore } from "firebase-admin/firestore";
import { boliviaToday, ChainMetadata, inspectChains, SanctionRow } from "@/lib/domain/recurrence-chain";

/** Read compatibility for legacy rows; this function never writes or invents a missing origin. */
export async function annotateSanctions(db: Firestore, rows: SanctionRow[]): Promise<Array<DocumentData & {id:string}>> {
  const people = [...new Set(rows.filter(r => r.estado === "registrada").map(r => String(r.personalId)))];
  // Batch people into indexed IN queries. A page still receives complete
  // chains, while a report avoids one separate query per police officer.
  const history:SanctionRow[]=[];
  for(let i=0;i<people.length;i+=30){
    const snap=await db.collection("faltas").where("personalId","in",people.slice(i,i+30)).get();
    history.push(...snap.docs.map(d=>({...d.data(),id:d.id})));
  }
  const byPerson = new Map(people.map(person => [person, new Map(inspectChains(history.filter(row=>row.personalId===person)).map(node=>[node.id,node]))]));
  const today = boliviaToday();
  return rows.map(row => {
    if (row.estado !== "registrada") return { ...row, estadoPlazoCadena: "sin_efecto" };
    const inspected = byPerson.get(String(row.personalId))?.get(row.id);
    if(!inspected?.metadata || inspected.error)return {...row,...inspected?.metadata,conductaOrigen:inspected?.metadata?.conductaOrigen??null,estadoPlazoCadena:"requiere_revision",revisionCadena:inspected?.error??"Origen no verificable"};
    return { ...row, ...inspected.metadata, estadoPlazoCadena: today >= inspected.metadata.fechaVencimientoCadena ? "vencida" : "dentro_del_plazo", revisionCadena: null };
  });
}

export function registrationClassification(row: Record<string, unknown>) {
  const evidence = (row.fundamentoOriginal ?? row.tipificacionOriginal) as ({ articulo?: string; inciso?: string; reincidenciaOrigen?: { faltaReferenciaId?: string } } & Partial<ChainMetadata>) | undefined;
  return { articuloOriginal: evidence?.articulo ?? row.articulo, incisoOriginal: evidence?.inciso ?? row.inciso,
    antecedenteOriginalId: evidence?.reincidenciaOrigen?.faltaReferenciaId ?? (row.reincidenciaOrigen as {faltaReferenciaId?:string})?.faltaReferenciaId ?? "",
    articuloActual: row.articulo, incisoActual: row.inciso };
}

export function statisticsByConduct(rows: DocumentData[]) {
  const groups=new Map<string,{articulo:string;inciso:string;sanciones:number;reincidencias:number;persons:Set<string>;chains:Set<string>}>();
  for(const row of rows){
    const conduct=row.conductaOrigen;
    if(!conduct||row.revisionCadena)continue;
    const key=`${conduct.articuloNumero}/${conduct.incisoNumero}`;
    const group=groups.get(key)??{articulo:conduct.articulo,inciso:conduct.inciso,sanciones:0,reincidencias:0,persons:new Set<string>(),chains:new Set<string>()};
    group.sanciones++;
    if(row.nivelEfectivo>0)group.reincidencias++;
    group.persons.add(row.personalId);group.chains.add(row.cadenaId);groups.set(key,group);
  }
  return [...groups.values()].map(({persons,chains,...row})=>({...row,personas:persons.size,cadenas:chains.size}));
}
