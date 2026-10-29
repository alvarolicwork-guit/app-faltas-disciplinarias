// Deployment regression: Vercel disables require(ESM) by default.
// Exercise Firebase's actual transitive JWKS dependency with local RSA keys only.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loading is the regression under test. */
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { generateKeyPairSync } = require("node:crypto");
require("firebase-admin/auth");
const fromAdmin = createRequire(require.resolve("firebase-admin/app"));
const jwks = fromAdmin("jwks-rsa");
const jwt = fromAdmin("jsonwebtoken");

(async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: "local-runtime-test", use: "sig" };
  const client = jwks({ jwksUri: "https://unused.invalid/keys", cache: false, rateLimit: false, fetcher: async () => ({ keys: [jwk] }) });
  const signingKey = await client.getSigningKey(jwk.kid);
  const token = jwt.sign({ sub: "synthetic-user" }, privateKey, { algorithm: "RS256", keyid: jwk.kid, issuer: "local-runtime-test", audience: "local-only", expiresIn: 60 });
  const options = { algorithms: ["RS256"], issuer: "local-runtime-test", audience: "local-only" };
  assert.equal(jwt.verify(token, signingKey.getPublicKey(), options).sub, "synthetic-user");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const forged = jwt.sign({ sub: "synthetic-user" }, other.privateKey, { algorithm: "RS256", issuer: options.issuer, audience: options.audience });
  assert.throws(() => jwt.verify(forged, signingKey.getPublicKey(), options), /invalid signature/);
  await assert.rejects(client.getSigningKey("unknown-key"));
  console.log(JSON.stringify({ firebaseAuthLoaded: true, rsaJwksVerified: true, forgedSignatureRejected: true, unknownKeyRejected: true, dataAccess: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
