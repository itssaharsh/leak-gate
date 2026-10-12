import Link from "next/link";

export default async function ThanksPage({ searchParams }: PageProps<"/thanks">) {
  const { order } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Your first plant is on its way.</h1>
      <p className="mt-4 text-[#3F4D44]">
        Order <span className="font-semibold tabular-nums">{typeof order === "string" ? order : ""}</span>. A receipt is in your inbox.
      </p>
      <Link href="/" className="mt-8 inline-block underline">
        Back to plans
      </Link>
    </div>
  );
}
