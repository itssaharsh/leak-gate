import { randomUUID } from "node:crypto";
import { VENDORS } from "@leakgate/drill";
import { secretMatches } from "@/lib/auth";
import { config } from "@/lib/config";
import { putCapture } from "@/lib/store";

const MAX_BYTES = 16 * 1024;

/**
 * The shop's simulated third-party vendors. Each request body is recorded as received,
 * so the drill can see exactly what the shop sent out.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/vendors/[vendor]">) {
  const { vendor } = await ctx.params;
  if (!(VENDORS as readonly string[]).includes(vendor)) return Response.json({ error: "Unknown vendor" }, { status: 404 });
  if (!secretMatches(req.headers.get("x-vendor-key"), config.vendorKey)) return Response.json({ error: "Missing or wrong vendor key" }, { status: 401 });

  const body = await req.text();
  if (Buffer.byteLength(body) > MAX_BYTES) return Response.json({ error: "Body over 16 KB" }, { status: 413 });
  const env = (req.headers.get("x-leakgate-env") ?? "unknown").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "unknown";

  const id = randomUUID();
  await putCapture(vendor, env, body, id);
  return Response.json({ received: true, id }, { status: 202 });
}
