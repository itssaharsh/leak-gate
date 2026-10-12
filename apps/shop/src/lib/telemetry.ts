import { sendToVendor } from "./vendors";

/** Error reporting: the message, the route, which fields were present, and optional request context. */
export async function reportError(error: Error, context: { route: string; fields?: string[]; request?: unknown }) {
  await sendToVendor("error-tracker", {
    message: error.message,
    route: context.route,
    fields: context.fields ?? [],
    request: context.request,
    env: process.env.LEAKGATE_ENV ?? "local",
  });
}

/** Product analytics keyed by user id. */
export async function track(event: string, userId: string, properties: Record<string, string | number | boolean> = {}) {
  await sendToVendor("analytics", { type: "track", event, userId, properties });
}

export async function identify(userId: string, traits: Record<string, string | number | boolean>) {
  await sendToVendor("analytics", { type: "identify", userId, traits });
}
