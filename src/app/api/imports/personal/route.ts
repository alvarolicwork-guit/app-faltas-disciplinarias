import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { canBulkImportPersonal } from "@/lib/domain/roles";
import { getAdminDb } from "@/lib/firebase/admin";
import { stagePersonalImport, processPersonalImport, personalImportResult, resumePersonalImportPreparation } from "@/lib/server/personal-import";
import { OperationError, operationError } from "@/lib/server/operations";

async function authorize(request:NextRequest) {
  const actor=await getRequestUser(request);
  if(!actor)throw new OperationError("No autorizado",401);
  if(!canBulkImportPersonal(actor.role))throw new OperationError("Solo superadministrador puede importar personal",403);
  return actor;
}
function validId(id:unknown):id is string{return typeof id==="string" && /^[\w-]{1,128}$/.test(id);}
function validateRows(rows: unknown): asserts rows is Record<string, unknown>[] {
  if(!Array.isArray(rows)||rows.length<1||rows.length>2000||rows.some((row:unknown)=>!row||typeof row!=="object"||Array.isArray(row)))throw new OperationError("Se requieren entre 1 y 2000 filas válidas como objetos",400);
}

export async function GET(request:NextRequest){
  try{
    await authorize(request);
    const id=request.nextUrl.searchParams.get("importId");
    if(id){if(!validId(id))throw new OperationError("ID inválido",400);return NextResponse.json(await personalImportResult(id));}
    const db=getAdminDb(), cursor=request.nextUrl.searchParams.get("cursor");
    let query=db.collection("imports_personal").orderBy("createdAt","desc").limit(20);
    if(cursor){
      if(!validId(cursor))throw new OperationError("Cursor inválido",400);
      const last=await db.collection("imports_personal").doc(cursor).get();
      if(!last.exists)throw new OperationError("Cursor no encontrado",400);
      query=query.startAfter(last);
    }
    const snap=await query.get();
    return NextResponse.json({data:snap.docs.map(d=>{const r=d.data();return {id:d.id,fileName:r.fileName,status:r.status??"confirmed",totalRows:r.totalRows,okRows:r.okRows,createdRows:r.createdRows,updatedRows:r.updatedRows,errorRows:r.errorRows,createdAt:r.createdAt?.toDate?.()?.toISOString()??null};}),nextCursor:snap.size===20?snap.docs.at(-1)!.id:null});
  }catch(error){return operationError(error);}
}

export async function POST(request:NextRequest){
  try{
    const actor=await authorize(request);
    const text=await request.text();
    if(Buffer.byteLength(text,"utf8")>4_000_000)throw new OperationError("El archivo excede 4 MB",413);
    let body;
    try{body=JSON.parse(text);}catch{throw new OperationError("Formato JSON inválido",400);}
    if(!body || typeof body!=="object" || Array.isArray(body))throw new OperationError("Cuerpo inválido",400);
    if(body.action !== undefined) {
      if(body.action !== "resume_preparation" || !validId(body.importId) || body.operationId !== undefined || body.unidadId !== undefined)throw new OperationError("Solicitud de recuperación inválida",400);
      validateRows(body.rows);
      return NextResponse.json(await resumePersonalImportPreparation(actor,body.importId,body.rows));
    }
    let id=body.importId;
    if(id !== undefined){
      if(!validId(id) || body.rows !== undefined || body.operationId !== undefined)throw new OperationError("Solicitud de continuación inválida",400);
    }else{
      if(body.unidadId!=="GLOBAL")throw new OperationError("Solo se permite importación global",400);
      validateRows(body.rows);
      if(body.operationId!==undefined && (typeof body.operationId!=="string"||!/^[\w-]{8,100}$/.test(body.operationId)))throw new OperationError("Operación inválida",400);
      id=await stagePersonalImport(actor,body.rows,String(body.fileName??"api-import").slice(0,200),body.operationId);
    }
    if(!validId(id))throw new OperationError("ID de importación inválido",400);
    return NextResponse.json(await processPersonalImport(actor,id));
  }catch(error){return operationError(error);}
}
export async function DELETE(){return NextResponse.json({error:"El reinicio de datos se realiza mediante el procedimiento administrativo controlado."},{status:410});}
