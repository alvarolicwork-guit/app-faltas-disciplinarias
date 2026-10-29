import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Optional module-load diagnosis, without credentials, stack traces or data access.
  let dependencies: Record<string, unknown> | undefined;
  if (new URL(request.url).searchParams.get("dependencies") === "1") {
    dependencies = {};
    const probes = {
      app: () => import("firebase-admin/app"),
      auth: () => import("firebase-admin/auth"),
      firestore: () => import("firebase-admin/firestore"),
      adapter: () => import("@/lib/firebase/admin"),
    };
    for (const [name, load] of Object.entries(probes)) {
      try { await load(); dependencies[name] = { loaded: true }; }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "LOAD_ERROR";
        const missing = error instanceof Error ? error.message.match(/Cannot find (?:module|package) ['"]([^'"]+)['"]/)?.[1] : undefined;
        dependencies[name] = { loaded: false, code, ...(missing && /^(?:@[\w-]+\/)?[\w.-]+(?:\/[\w.-]+)*$/.test(missing) ? { package: missing } : {}) };
      }
    }
  }
  return NextResponse.json(
    {
      ok: true,
      service: "app-faltas",
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
      ...(dependencies ? { dependencies } : {}),
    },
    { status: 200 },
  );
}
