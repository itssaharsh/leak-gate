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
    await reportError(new Error("signup validation failed"), { route: ROUTE, fields: Object.keys(problems) });
    accessLine(req, ROUTE, 400, startedAt);
    return Response.json({ error: "Check the highlighted fields.", problems }, { status: 400 });
  }

  const user = { name: str(body, "name"), email: str(body, "email"), phone: str(body, "phone", 40), password: str(body, "password", 500) };
  let userId: string;
  try {
    userId = await createUser(user);
  } catch (e) {
    await reportError(e instanceof Error ? e : new Error("createUser failed"), { route: ROUTE });
    accessLine(req, ROUTE, 503, startedAt);
    return Response.json({ error: "We couldn't create your account. Try again in a minute." }, { status: 503 });
  }

  await identify(userId, { plan: "none" });
  await sendToVendor("email-vendor", { template: "welcome", to: user.email, name: user.name });
  log("signup", { userId });

  accessLine(req, ROUTE, 201, startedAt);
  return Response.json({ userId }, { status: 201 });
}
