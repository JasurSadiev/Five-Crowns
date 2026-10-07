import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, col, db } from './admin';
import { appError, friendlyMessage } from './errors';

/**
 * Asserts the caller is signed in and returns their uid.
 *
 * This throws an HttpsError rather than an AppError on purpose: every callable
 * evaluates `requireAuth(request)` as an *argument* to the wrapped handler, so
 * it runs outside that handler's try/catch. An AppError thrown here would be
 * reported to the browser as a bare INTERNAL instead of `unauthenticated`.
 */
export function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', friendlyMessage('unauthenticated'), {
      code: 'unauthenticated',
    });
  }
  return uid;
}

export function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw appError('invalid_argument', 'invalid-argument', `${field} is required.`);
  }
  if (value.length > max) {
    throw appError('invalid_argument', 'invalid-argument', `${field} is too long.`);
  }
  return value.trim();
}

export function optionalString(value: unknown, max = 200): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    throw appError('invalid_argument', 'invalid-argument', 'Invalid value.');
  }
  return value.trim();
}

export function requireNumber(value: unknown, field: string, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw appError('invalid_argument', 'invalid-argument', `${field} must be ${min}-${max}.`);
  }
  return num;
}

export function requireBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Fixed-window rate limiter backed by a single Firestore document per
 * (user, action). Used for chat, invitations, lobby creation and reports.
 */
export async function rateLimit(
  uid: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const ref = col.rateLimit(`${uid}__${action}`);
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { window?: number; count?: number } | undefined;
    if (data && data.window === windowStart) {
      if ((data.count ?? 0) >= limit) {
        throw appError('rate_limited', 'resource-exhausted');
      }
      tx.update(ref, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(ref, {
        window: windowStart,
        count: 1,
        action,
        uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

/** Deterministic key for a friendship / block relationship between two users. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('_');
}

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;

export function validateUsername(name: string): string {
  const trimmed = name.trim();
  if (!USERNAME_RE.test(trimmed)) throw appError('invalid_username', 'invalid-argument');
  return trimmed;
}

/** Keeps a bounded map of handled request ids so a replayed action is a no-op. */
export function rememberRequest(
  processed: Record<string, number> | undefined,
  requestId: string | null,
): Record<string, number> {
  const next = { ...(processed ?? {}) };
  if (requestId) next[requestId] = Date.now();
  const entries = Object.entries(next);
  if (entries.length > 40) {
    entries.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(entries.slice(0, 40));
  }
  return next;
}

export function alreadyProcessed(
  processed: Record<string, number> | undefined,
  requestId: string | null,
): boolean {
  if (!requestId || !processed) return false;
  return Object.prototype.hasOwnProperty.call(processed, requestId);
}
