"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Field, postJson } from "@/components/Field";

function SignupForm() {
  const router = useRouter();
  const plan = useSearchParams().get("plan") ?? "monthly-fern";
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await postJson("/api/signup", { ...data, newsletter: data.newsletter === "on" });
    setBusy(false);
    if (!res.ok) {
      setProblems((res.json.problems as Record<string, string>) ?? {});
      setError(String(res.json.error ?? "Something went wrong. Try again."));
      return;
    }
    sessionStorage.setItem("greenstem-customer", JSON.stringify({ name: data.name, email: data.email }));
    router.push(`/checkout?u=${res.json.userId}&plan=${plan}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-lg bg-[#FBECEA] px-4 py-3 text-sm text-[#8C1D18]">
          {error}
        </p>
      )}
      <Field label="Full name" name="name" autoComplete="name" error={problems.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" error={problems.email} />
      <Field label="Mobile number" name="phone" type="tel" autoComplete="tel" error={problems.phone} hint="We text you on delivery day." />
      <Field label="Password" name="password" type="password" autoComplete="new-password" error={problems.password} hint="At least 10 characters." />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="newsletter" className="mt-1 size-4" />
        <span>Send me the monthly plant-care newsletter. You can leave any time.</span>
      </label>
      <button disabled={busy} className="h-12 rounded-lg bg-[#24603A] font-semibold text-white hover:bg-[#1C4D2E] disabled:opacity-60">
        {busy ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-[#3F4D44]">Two steps: your account, then where to deliver.</p>
      <Suspense>
        <SignupForm />
      </Suspense>
    </div>
  );
}
