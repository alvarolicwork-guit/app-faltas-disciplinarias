import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";

const issuer="https://token.actions.githubusercontent.com";
const keys=createRemoteJWKSet(new URL(issuer+"/.well-known/jwks"),{timeoutDuration:5_000});
const repository="alvarolicwork-guit/app-faltas-disciplinarias";
export async function verifyGithubCronToken(token:string,key:JWTVerifyGetKey|CryptoKey=keys):Promise<boolean>{
  try{
    if(token.length>16_000||token.split(".").length!==3||decodeJwt(token).iss!==issuer)return false;
    const {payload}=await jwtVerify(token,key,{issuer,audience:"app-faltas-expire-requests",algorithms:["RS256"],maxTokenAge:"10m",clockTolerance:10});
    return payload.repository_id==="1244004584"&&payload.repository_owner_id==="254030428"&&payload.repository===repository&&payload.repository_visibility==="public"&&payload.ref==="refs/heads/main"&&payload.workflow_ref===repository+"/.github/workflows/expire-requests.yml@refs/heads/main"&&["schedule","workflow_dispatch","push"].includes(String(payload.event_name));
  }catch{return false;}
}
