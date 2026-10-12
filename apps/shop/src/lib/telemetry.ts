import { sendToVendor } from "./vendors";

/** Error reporting: the message, the route and which fields were present. Never field values. */
export async function reportError(error: Error, context: { route: string; fields?: string[] }) {
  await sendToVendor("error-tracker", {
    message: error.message,
    route: context.route,
    fields: context.fields ?? [],
    env: process.env.LEAKGATE_ENV ?? "local",
  });
}

/** Product analytics keyed by user id only. */
export async function track(event: string, userId: string, properties: Record<string, string | number | boolean> = {}) {
  await sendToVendor("analytics", { type: "track", event, userId, properties });
}

export async function identify(userId: string, traits: Record<string, string | number | boolean>) {
  await sendToVendor("analytics", { type: "identify", userId, traits });
}
