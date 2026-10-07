/**
 * Raw Firebase errors are never shown to a player. Everything is mapped to a
 * short, human sentence; anything unmapped becomes a generic apology and is
 * logged for us instead.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'We could not find an account with that email.',
  'auth/wrong-password': 'That email and password do not match.',
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/invalid-login-credentials': 'That email and password do not match.',
  'auth/email-already-in-use': 'An account already exists with that email.',
  'auth/weak-password': 'Please choose a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups and try again.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/network-request-failed': 'We could not reach the server. Check your connection.',
  'auth/requires-recent-login': 'Please sign in again before changing this.',
  'auth/operation-not-allowed': 'That sign-in method is not enabled for this project.',
};

const CODE_MESSAGES: Record<string, string> = {
  'permission-denied': 'You are not allowed to do that.',
  unauthenticated: 'Please sign in to continue.',
  'not-found': 'We could not find that.',
  'already-exists': 'That already exists.',
  'resource-exhausted': 'You are doing that too quickly. Please slow down.',
  unavailable: 'You appear to be offline. Reconnecting...',
  'deadline-exceeded': 'That took too long. Please try again.',
  cancelled: 'That request was cancelled.',
  internal: 'Something went wrong. Please try again.',
};

export interface FriendlyError extends Error {
  code: string;
  original?: unknown;
}

export function friendlyError(error: unknown): FriendlyError {
  const raw = error as { code?: string; message?: string } | undefined;
  const code = raw?.code ?? 'internal';

  if (code.startsWith('auth/')) {
    return build(code, AUTH_MESSAGES[code] ?? 'We could not complete that sign-in. Try again.', error);
  }

  // Callable errors already carry a human message produced by our functions.
  if (raw?.message && !/^(INTERNAL|internal)$/.test(raw.message)) {
    const cleaned = raw.message.replace(/^.*?:\s*/, (match) =>
      /error/i.test(match) ? '' : match,
    );
    return build(code, cleaned || CODE_MESSAGES[code] || 'Something went wrong. Please try again.', error);
  }

  return build(code, CODE_MESSAGES[code] ?? 'Something went wrong. Please try again.', error);
}

function build(code: string, message: string, original: unknown): FriendlyError {
  const err = new Error(message) as FriendlyError;
  err.code = code;
  err.original = original;
  return err;
}

export function errorMessage(error: unknown): string {
  return friendlyError(error).message;
}
