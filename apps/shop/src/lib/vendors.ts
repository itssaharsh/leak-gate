import { log } from "./log";

export type Vendor = "error-tracker" | "analytics" | "email-vendor" | "shipping-vendor" | "crm";

/**
 * Sends a payload to one of the shop's third-party vendors. In this demo the vendors are
 * Leak Gate's simulated endpoints, which record exactly what they receive.
 */
export async function sendToVendor(vendor: Vendor, payload: unknown): Promise<void> {
  const base = process.env.VENDOR_BASE_URL;
  if (!base) return;
  try {
    const res = await fetch(new URL(`/api/vendors/${vendor}`, base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vendor-key": process.env.VENDOR_KEY ?? "",
        "x-leakgate-env": process.env.LEAKGATE_ENV ?? "local",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) log("vendor call failed", { vendor, status: res.status }, "warn");
  } catch (e) {
    log("vendor call failed", { vendor, error: e instanceof Error ? e.name : "unknown" }, "warn");
  }
}
