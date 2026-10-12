import { getRun } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || id.startsWith("_")) return Response.json({ error: "Bad run id" }, { status: 400 });
  const run = await getRun(id);
  if (!run) return Response.json({ error: "No such run" }, { status: 404 });
  return Response.json(run, { headers: { "cache-control": "no-store" } });
}
