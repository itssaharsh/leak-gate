"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Field, postJson } from "@/components/Field";
import { PLANS, price } from "@/lib/plans";

function CheckoutForm() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get("u") ?? "";
  const [plan, setPlan] = useState(params.get("plan") ?? "monthly-fern");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    let customer: { name?: string; email?: string } = {};
    try {
      customer = JSON.parse(sessionStorage.getItem("greenstem-customer") ?? "{}");
    } catch {
      customer = {};
    }
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await postJson("/api/checkout", { userId, name: customer.name, email: customer.email, address: data.address, plan });
    setBusy(false);
    if (!res.ok) {
      setError(String(res.json.error ?? "Something went wrong. Try again."));
      return;
    }
    router.push(`/thanks?order=${res.json.orderId}`);
  }

  if (!userId) {
    return (
      <p className="mt-8 text-[#3F4D44]">
        Start by{" "}
        <Link className="underline" href="/signup">
          creating an account
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-lg bg-[#FBECEA] px-4 py-3 text-sm text-[#8C1D18]">
          {error}
        </p>
      )}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Plan</legend>
        {Object.entries(PLANS).map(([id, p]) => (
          <label key={id} className="flex items-center gap-3 rounded-lg border border-[#D7DFD4] px-4 py-3">
            <input type="radio" name="plan" value={id} checked={plan === id} onChange={() => setPlan(id)} />
            <span className="flex-1">{p.label}</span>
            <span className="tabular-nums">{price(p.pence)}</span>
          </label>
        ))}
      </fieldset>
      <Field label="Delivery address" name="address" autoComplete="street-address" hint="Flat or house, street, town and postcode." />
      <button disabled={busy} className="h-12 rounded-lg bg-[#24603A] font-semibold text-white hover:bg-[#1C4D2E] disabled:opacity-60">
        {busy ? "Placing your order…" : "Place order"}
      </button>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Where should we deliver?</h1>
      <Suspense>
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
