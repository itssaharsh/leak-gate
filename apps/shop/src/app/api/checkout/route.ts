import { randomBytes } from "node:crypto";
import { accessLine, log } from "@/lib/log";
import { PLANS } from "@/lib/plans";
import { reportError, track } from "@/lib/telemetry";
import { EMAIL, readJson, str } from "@/lib/validate";
import { sendToVendor } from "@/lib/vendors";

const ROUTE = "/api/checkout";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = await readJson(req);
  const plan = body ? str(body, "plan") : "";
  const order = body && {
    userId: str(body, "userId", 40),
    name: str(body, "name"),
    email: str(body, "email"),
    address: str(body, "address", 300),
    plan,
  };
  if (!order || !order.userId || order.name.length < 2 || !EMAIL.test(order.email) || order.address.length < 8 || !PLANS[plan]) {
    await reportError(new Error("checkout validation failed"), { route: ROUTE, fields: body ? Object.keys(body) : [] });
    accessLine(req, ROUTE, 400, startedAt);
    return Response.json({ error: "Check your delivery address and plan." }, { status: 400 });
  }

  const orderId = `o_${randomBytes(5).toString("hex")}`;
  await sendToVendor("shipping-vendor", { orderId, recipient: order.name, address: order.address, item: PLANS[plan].label });
  await sendToVendor("email-vendor", { template: "receipt", to: order.email, name: order.name, orderId, amountPence: PLANS[plan].pence });
  await track("checkout completed", order.userId, { plan, amountPence: PLANS[plan].pence });
  log("order placed", { orderId, userId: order.userId, plan });

  accessLine(req, ROUTE, 201, startedAt);
  return Response.json({ orderId }, { status: 201 });
}
