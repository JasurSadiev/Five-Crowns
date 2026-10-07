import { randomInt } from 'node:crypto';
import { col, db, FieldValue } from './admin';
import { appError } from './errors';

/**
 * Lobby codes avoid characters that are easy to confuse when read aloud or
 * typed: 0/O, 1/I/L. Codes are case insensitive (always stored upper case) and
 * are reserved in `lobbyCodes/{CODE}` so two active lobbies can never collide.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;

/**
 * Codes are case insensitive. The alphabet contains neither `O`/`0` nor
 * `I`/`1`/`L`, so a player who types a lookalike simply gets "lobby not found"
 * rather than joining the wrong table.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Reserves a unique code, retrying on the (very unlikely) collision. */
export async function reserveJoinCode(lobbyId: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomCode();
    const ref = col.lobbyCode(code);
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { lobbyId, createdAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (created) return code;
  }
  throw appError('internal', 'internal', 'Could not allocate a lobby code. Please try again.');
}

export async function releaseJoinCode(code: string | null | undefined): Promise<void> {
  if (!code) return;
  await col.lobbyCode(code).delete().catch(() => undefined);
}

export async function lobbyIdForCode(code: string): Promise<string | null> {
  const cleaned = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!cleaned) return null;
  const snap = await col.lobbyCode(cleaned).get();
  if (!snap.exists) return null;
  return (snap.data()?.lobbyId as string) ?? null;
}
