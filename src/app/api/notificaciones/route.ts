import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertCurrentActor, operationError, OperationError } from "@/lib/server/operations";
import { FieldPath, FieldValue, Filter, Timestamp } from "firebase-admin/firestore";
export async function GET(request:NextRequest){
  try{
    const actor=await getRequestUser(request);
    if(!actor)return NextResponse.json({error:"No autorizado"},{status:401});
    const db=getAdminDb();
    const filters=[Filter.where("destinatarioUid","==",actor.uid)];
    if(actor.unidadId && ["admin_unidad","operador_unidad"].includes(actor.role))filters.push(Filter.where("unidadId","==",actor.unidadId));
    if(["admin_dpto","super_admin"].includes(actor.role))filters.push(Filter.where("revisores","==",true));
    const base=db.collection("notificaciones").where(Filter.or(...filters));
    let page=base.orderBy("createdAt","desc").limit(50);
    const cursor=request.nextUrl.searchParams.get("cursor");
    if(cursor){
      if(!/^[\w-]{1,200}$/.test(cursor))throw new OperationError("Cursor inválido",400);
      const last=await db.collection("notificaciones").doc(cursor).get();
      if(!last.exists)throw new OperationError("La lista cambió; vuelva a consultar",409);
      page=page.startAfter(last);
    }
    const [snap,total,read]=await Promise.all([page.get(),base.count().get(),base.where("readBy","array-contains",actor.uid).count().get()]);
    return NextResponse.json({data:snap.docs.map(d=>{const row=d.data();return {...row,id:d.id,leida:!!row.leidaPor?.[actor.uid],createdAt:row.createdAt.toDate().toISOString()};}),unreadTotal:Math.max(0,total.data().count-read.data().count),nextCursor:snap.size===50?snap.docs.at(-1)!.id:null});
  }catch(error){return operationError(error);}
}
export async function PATCH(request:NextRequest){
  try{
    const actor=await getRequestUser(request);
    if(!actor)return NextResponse.json({error:"No autorizado"},{status:401});
    const {id}=await request.json();
    if(typeof id!=="string" || !/^[\w-]{1,200}$/.test(id))throw new OperationError("Identificador inválido",400);
    const db=getAdminDb(), ref=db.collection("notificaciones").doc(id);
    await db.runTransaction(async tx=>{
      await assertCurrentActor(tx,db,actor);
      const data=(await tx.get(ref)).data();
      if(!data || !(data.destinatarioUid===actor.uid || (actor.unidadId && ["admin_unidad","operador_unidad"].includes(actor.role) && data.unidadId===actor.unidadId) || (data.revisores && ["admin_dpto","super_admin"].includes(actor.role))))throw new OperationError("Sin acceso",403);
      tx.update(ref,new FieldPath("leidaPor",actor.uid),Timestamp.now(),"readBy",FieldValue.arrayUnion(actor.uid));
    });
    return NextResponse.json({ok:true});
  }catch(error){return operationError(error);}
}
