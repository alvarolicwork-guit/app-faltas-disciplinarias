/** A test override must never activate against a deployed Firebase project. */
export function skipLocalRecurrenceWait(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" &&
    env.LOCAL_DEMO_SKIP_RECURRENCE_WAIT === "true" &&
    env.FIREBASE_PROJECT_ID === "demo-app-faltas" &&
    env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8087" &&
    env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9097";
}
