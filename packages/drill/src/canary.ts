import { randomBytes, randomInt } from "node:crypto";

export type Field = "name" | "email" | "phone" | "password" | "address";
export const FIELDS: Field[] = ["name", "email", "phone", "password", "address"];

/** One planted value and the strings that count as finding it. */
export interface Marker {
  field: Field;
  /** The value exactly as the synthetic customer types it. */
  value: string;
  /** Distinctive substrings; any of them appearing in a sink is a hit. */
  needles: string[];
}

export interface Canary {
  runId: string;
  /** Short code shown on the identity card's MRZ strip. */
  code: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  address: string;
  markers: Marker[];
}

// Crockford-style alphabet without look-alikes (no I, L, O, U, 0, 1).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function tag(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Keeps a judge-supplied first name to letters, 2 to 20 characters. */
export function cleanFirstName(input?: string): string {
  const letters = (input ?? "").normalize("NFKD").replace(/[^A-Za-z]/g, "").slice(0, 20);
  if (letters.length < 2) return "Ada";
  return letters[0].toUpperCase() + letters.slice(1).toLowerCase();
}

/**
 * Builds a synthetic customer whose every field carries its own unique tag,
 * so a hit in any sink names exactly one field.
 * Phone numbers come from Ofcom's range reserved for drama (07700 900000-900999).
 */
export function makeCanary(firstName?: string): Canary {
  const first = cleanFirstName(firstName);
  const code = tag(4);
  const nameTag = tag(4);
  const emailTag = tag(6).toLowerCase();
  const pwTag = tag(8);
  const flatTag = tag(5);
  const phoneTail = String(randomInt(0, 1000)).padStart(3, "0");

  const name = `${first} Canary-${nameTag}`;
  const email = `${first.toLowerCase()}.${emailTag}@canary.leakgate.test`;
  const phone = `+44 7700 900${phoneTail}`;
  const password = `Cnry!${pwTag}#26`;
  const address = `Flat ${flatTag}, 12 Linden Row, Bristol BS1 4DJ`;

  const markers: Marker[] = [
    { field: "name", value: name, needles: [`Canary-${nameTag}`] },
    { field: "email", value: email, needles: [`${first.toLowerCase()}.${emailTag}`, emailTag] },
    { field: "phone", value: phone, needles: [phone, `447700900${phoneTail}`, `07700900${phoneTail}`, `7700 900${phoneTail}`] },
    { field: "password", value: password, needles: [pwTag] },
    { field: "address", value: address, needles: [`Flat ${flatTag}`, flatTag] },
  ];

  return {
    runId: `run_${Date.now().toString(36)}_${tag(4).toLowerCase()}`,
    code,
    name,
    email,
    phone,
    password,
    address,
    markers,
  };
}

/** Returns the markers whose needles occur in `text`, with the first needle found. */
export function findMarkers(text: string, markers: Marker[]): { marker: Marker; needle: string; index: number }[] {
  const found: { marker: Marker; needle: string; index: number }[] = [];
  const lower = text.toLowerCase();
  for (const marker of markers) {
    for (const needle of marker.needles) {
      const index = lower.indexOf(needle.toLowerCase());
      if (index >= 0) {
        found.push({ marker, needle: text.slice(index, index + needle.length), index });
        break;
      }
    }
  }
  return found;
}
