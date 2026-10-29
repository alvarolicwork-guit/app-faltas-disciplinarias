import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { historicalImportEnabled } from "@/lib/imports/historical-sanctions";
import { OperationError, operationError } from "@/lib/server/operations";

export async function GET(request:NextRequest, context:{params:Promise<{id:string}>}) {
  try {
    const actor=await getRequestUser(request);
    if(!actor)throw new OperationError("No autorizado",401);
    if(actor.role!=="super_admin")throw new OperationError("Solo superadministrador",403);
    const {id}=await context.params;
    if(!/^[\w-]{1,128}$/.test(id))throw new OperationError("ID inválido",400);
    const ref=getAdminDb().collection("imports_sanciones").doc(id);
    const snap=await ref.get();
    if(!snap.exists)throw new OperationError("Importación no encontrada",404);
    const rows=await ref.collection("rows").orderBy("sourceRow").get();
    const data=snap.data()!;
    return NextResponse.json({importId:id,fileName:data.fileName,status:data.status,totalRows:data.totalRows,validRows:data.validRows??0,warningRows:data.warningRows??0,errorRows:data.errorRows??0,duplicateRows:data.duplicateRows??0,createdRows:data.createdRows??0,pendingRows:data.pendingRows??null,canConfirm:historicalImportEnabled()&&["preview","failed","processing"].includes(data.status)&&(data.validRows??0)+(data.warningRows??0)>0,rows:rows.docs.map(d=>{const row=d.data();return {...row,appliedAt:row.appliedAt?.toDate?.()?.toISOString()??null};})});
  }catch(error){return operationError(error);}
}
