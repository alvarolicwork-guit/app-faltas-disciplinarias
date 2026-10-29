import { NextRequest, NextResponse } from "next/server";

/** Applies to actual HTTP requests as well as transaction fences in handlers.
 * /me remains available so the operator keeps their access during maintenance. */
export async function proxy(request:NextRequest) {
  const path=request.nextUrl.pathname;
  // The worker authenticates its own OIDC/secret and reads the transaction fence.
  if(path==="/api/health"||path==="/api/internal/expire-requests")return NextResponse.next();
  const authorization=request.headers.get("authorization");
  if(!authorization?.startsWith("Bearer "))return NextResponse.next();
  try {
    // Keep public health and anonymous routes independent of Admin SDK loading.
    // Node proxy is packaged separately from route handlers on the deployment host.
    const {getAdminDb,getAdminAuth}=await import("@/lib/firebase/admin");
    try{await getAdminAuth().verifyIdToken(authorization.slice(7));}
    catch{return NextResponse.next();} // Handler returns 401; no database read for invalid tokens.
    const state=(await getAdminDb().collection("access_control").doc("maintenance").get()).data();
    if(state?.active && path!=="/api/me")return NextResponse.json({error:"Mantenimiento de datos en curso. Intente nuevamente en unos minutos.",code:"MAINTENANCE"},{status:503,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
    const generation=request.headers.get("x-data-generation");
    if(path!=="/api/me" && generation!==null && generation!==String(state?.generation??0))return NextResponse.json({error:"Los datos se actualizaron. Reinicie la consulta.",code:"DATA_RESET"},{status:409,headers:{"Cache-Control":"no-store"}});
    return NextResponse.next();
  }catch{
    return NextResponse.json({error:"No se pudo comprobar la disponibilidad del servicio"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={matcher:["/api/:path*"]};
