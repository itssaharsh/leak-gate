export type Body = Record<string, unknown>;

export async function readJson(req: Request): Promise<Body | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Body) : null;
  } catch {
    return null;
  }
}

export function str(body: Body, key: string, max = 200): string {
  const v = body[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the problems with a signup, keyed by field. */
export function signupProblems(b: Body): Record<string, string> {
  const problems: Record<string, string> = {};
  if (str(b, "name").length < 2) problems.name = "Enter your name.";
  if (!EMAIL.test(str(b, "email"))) problems.email = "Enter an email address like name@example.com.";
  if (str(b, "phone").replace(/\D/g, "").length < 7) problems.phone = "Enter a phone number we can text delivery updates to.";
  if (str(b, "password", 500).length < 10) problems.password = "Use at least 10 characters.";
  return problems;
}
