export const PLANS: Record<string, { label: string; pence: number; blurb: string }> = {
  "monthly-fern": { label: "Monthly fern box", pence: 1800, blurb: "One easy-care fern a month, potted and ready." },
  "seasonal-trio": { label: "Seasonal trio", pence: 4200, blurb: "Three plants picked for the season, every quarter." },
};

export function price(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
