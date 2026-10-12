export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`h-11 rounded-lg border px-3 ${error ? "border-[#B3261E]" : "border-[#7C8A80]"}`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-[#55635A]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm text-[#B3261E]">
          {error}
        </p>
      )}
    </div>
  );
}

export async function postJson(url: string, data: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}
