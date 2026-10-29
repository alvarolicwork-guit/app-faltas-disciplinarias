import assert from "node:assert/strict";
import {test} from "node:test";
import {generateKeyPair,SignJWT} from "jose";
import {verifyGithubCronToken} from "./cron-identity";

test("Solo el programador firmado del repositorio, flujo y rama aprobados puede vencer solicitudes",async()=>{
  const {privateKey,publicKey}=await generateKeyPair("RS256");
  const repo="alvarolicwork-guit/app-faltas-disciplinarias";
  const claims={repository_id:"1244004584",repository_owner_id:"254030428",repository:repo,repository_visibility:"public",ref:"refs/heads/main",workflow_ref:repo+"/.github/workflows/expire-requests.yml@refs/heads/main",event_name:"schedule"};
  const sign=(overrides:Record<string,unknown>={})=>new SignJWT({...claims,...overrides}).setProtectedHeader({alg:"RS256"}).setIssuer("https://token.actions.githubusercontent.com").setAudience("app-faltas-expire-requests").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  assert.equal(await verifyGithubCronToken(await sign(),publicKey),true);
  for(const bad of [{repository_id:"otro"},{repository_owner_id:"otro"},{repository_visibility:"private"},{ref:"refs/heads/otra"},{workflow_ref:repo+"/.github/workflows/otro.yml@refs/heads/main"},{event_name:"pull_request"}])assert.equal(await verifyGithubCronToken(await sign(bad),publicKey),false);
  const other=await generateKeyPair("RS256");assert.equal(await verifyGithubCronToken(await sign(),other.publicKey),false);
  const wrongAudience=await new SignJWT(claims).setProtectedHeader({alg:"RS256"}).setIssuer("https://token.actions.githubusercontent.com").setAudience("other-task").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  assert.equal(await verifyGithubCronToken(wrongAudience,publicKey),false);
  const expired=await new SignJWT(claims).setProtectedHeader({alg:"RS256"}).setIssuer("https://token.actions.githubusercontent.com").setAudience("app-faltas-expire-requests").setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  assert.equal(await verifyGithubCronToken(expired,publicKey),false);
  assert.equal(await verifyGithubCronToken("invalid",publicKey),false);
});
