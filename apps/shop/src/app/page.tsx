import Link from "next/link";
import { PLANS, price } from "@/lib/plans";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight">Plants that arrive ready to live with.</h1>
      <p className="mt-4 max-w-lg text-lg text-[#3F4D44]">
        A potted plant at your door every month, with care notes written for your light and your schedule.
      </p>
      <section id="plans" className="mt-12 grid gap-5 sm:grid-cols-2">
        {Object.entries(PLANS).map(([id, plan]) => (
          <div key={id} className="rounded-xl border border-[#D7DFD4] p-6">
            <h2 className="text-xl font-semibold">{plan.label}</h2>
            <p className="mt-2 text-[#3F4D44]">{plan.blurb}</p>
            <p className="mt-4 text-2xl font-bold tabular-nums">{price(plan.pence)}</p>
            <Link
              href={`/signup?plan=${id}`}
              className="mt-5 inline-block rounded-lg bg-[#24603A] px-5 py-3 font-semibold text-white hover:bg-[#1C4D2E]"
            >
              Start this plan
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
