/**
 * SUG-1 app lock. The PIN is never stored: only a PBKDF2-SHA-256 hash with a random salt.
 * The lock hides the app; it does not encrypt the database.
 */
import type { PinRecord } from './types';

export const PIN_RE = /^\d{4,6}$/;
const ITERATIONS = 310_000;

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
}

export async function hashPin(pin: string, iterations = ITERATIONS): Promise<PinRecord> {
  if (!PIN_RE.test(pin)) throw new Error('PIN must be 4–6 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { saltB64: toB64(salt), hashB64: toB64(await derive(pin, salt, iterations)), iterations };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const got = new Uint8Array(await derive(pin, fromB64(rec.saltB64), rec.iterations));
  const want = fromB64(rec.hashB64);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}
