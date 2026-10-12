import { randomBytes } from "node:crypto";
import { accessLine, log } from "@/lib/log";
import { EMAIL, readJson, str } from "@/lib/validate";
import { sendToVendor } from "@/lib/vendors";

const ROUTE = "/api/support";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = await readJson(req);
  const email = body ? str(body, "email") : "";
  const message = body ? str(body, "message", 2000) : "";
  if (!EMAIL.test(email) || message.length < 5) {
    accessLine(req, ROUTE, 400, startedAt);
    return Response.json({ error: "Add your email and a message of at least a few words." }, { status: 400 });
  }

  const ticketId = `t_${randomBytes(4).toString("hex")}`;
  await sendToVendor("email-vendor", { template: "support-ticket", to: "help@greenstem.example", replyTo: email, ticketId, message });
  log("support ticket opened", { ticketId, length: message.length });

  accessLine(req, ROUTE, 202, startedAt);
  return Response.json({ ticketId }, { status: 202 });
}
