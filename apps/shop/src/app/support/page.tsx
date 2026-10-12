"use client";

import { useState } from "react";
import { Field, postJson } from "@/components/Field";

export default function SupportPage() {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await postJson("/api/support", data);
    if (res.ok) setState("sent");
    else {
      setError(String(res.json.error ?? "Something went wrong. Try again."));
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Ask us anything</h1>
      {state === "sent" ? (
        <p role="status" className="mt-8 rounded-lg bg-[#EAF3EC] px-4 py-3">
          Thanks. We usually reply within a day.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          {state === "error" && (
            <p role="alert" className="rounded-lg bg-[#FBECEA] px-4 py-3 text-sm text-[#8C1D18]">
              {error}
            </p>
          )}
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-message" className="text-sm font-semibold">
              Message
            </label>
            <textarea id="f-message" name="message" rows={5} className="rounded-lg border border-[#7C8A80] px-3 py-2" />
          </div>
          <button disabled={state === "busy"} className="h-12 rounded-lg bg-[#24603A] font-semibold text-white hover:bg-[#1C4D2E] disabled:opacity-60">
            {state === "busy" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </div>
  );
}
