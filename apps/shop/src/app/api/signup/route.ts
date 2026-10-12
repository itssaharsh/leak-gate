import { accessLine, log } from "@/lib/log";
import { identify, reportError } from "@/lib/telemetry";
import { createUser } from "@/lib/users";
import { readJson, signupProblems, str } from "@/lib/validate";
import { sendToVendor } from "@/lib/vendors";

const ROUTE = "/api/signup";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = await readJson(req);
  if (!body) {
    accessLine(req, ROUTE, 400, startedAt);
    return Response.json({ error: "Send the signup form as JSON." }, { status: 400 });
  }

  const problems = signupProblems(body);
  if (Object.keys(problems).length > 0) {
    // Attach the submitted form so failed signups can be debugged from the error tracker.
    await reportError(new Error("signup validation failed"), { route: ROUTE, fields: Object.keys(problems), request: body });
    accessLine(req, ROUTE, 400, startedAt);
    return Response.json({ error: "Check the highlighted fields.", problems }, { status: 400 });
  }

  const user = { name: str(body, "name"), email: str(body, "email"), phone: str(body, "phone", 40), password: str(body, "password", 500) };
  const newsletter = body.newsletter === true;
  let userId: string;
  try {
    userId = await createUser(user);
  } catch (e) {
    await reportError(e instanceof Error ? e : new Error("createUser failed"), { route: ROUTE });
    accessLine(req, ROUTE, 503, startedAt);
    return Response.json({ error: "We couldn't create your account. Try again in a minute." }, { status: 503 });
  }

  if (newsletter) {
    log("newsletter opt-in", { userId, body });
    await sendToVendor("email-vendor", { list: "newsletter", to: user.email, name: user.name });
  }

  // Segment newsletter subscribers in analytics.
  await identify(userId, { plan: "none", newsletter, name: user.name, email: user.email, phone: user.phone });
  await sendToVendor("email-vendor", { template: "welcome", to: user.email, name: user.name });
  log("signup", { userId, newsletter });

  accessLine(req, ROUTE, 201, startedAt);
  return Response.json({ userId }, { status: 201 });
}
