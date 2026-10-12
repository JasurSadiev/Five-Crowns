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

/**
 * Shown when the Cloud Functions backend is missing entirely.
 *
 * This is not a hypothetical: deploying only Hosting leaves every callable
 * returning 404, and the whole app then failed with an unhelpful "Something
 * went wrong". Creating a lobby, starting a game and every other action runs
 * on the server, so there is nothing to retry until the backend is deployed.
 */
export const BACKEND_MISSING = 'backend-missing';

const BACKEND_MISSING_MESSAGE =
  'The game server has not been deployed yet, so nothing can be saved. ' +
  'Run "npm run deploy:functions" to publish it.';

/** True when a failure means "the callable does not exist in this project". */
export function isBackendMissing(error: unknown): boolean {
  const raw = error as { code?: string; message?: string } | undefined;
  const code = String(raw?.code ?? '');
  if (code === BACKEND_MISSING) return true;
  // The SDK reports a missing callable as functions/not-found.
  if (code === 'functions/not-found') return true;
  // Hosting answers an unknown /404 with an HTML page, which the SDK cannot parse.
  return /Unexpected token|not valid JSON|<!doctype|<html/i.test(String(raw?.message ?? ''));
}

export interface FriendlyError extends Error {
  code: string;
  original?: unknown;
}

export function friendlyError(error: unknown): FriendlyError {
  const raw = error as { code?: string; message?: string } | undefined;
  const code = raw?.code ?? 'internal';

  // Check this before anything else: a missing backend masquerades as several
  // different low-level errors, none of which mean what they say.
  if (isBackendMissing(error)) return build(BACKEND_MISSING, BACKEND_MISSING_MESSAGE, error);

  if (code.startsWith('auth/')) {
    return build(code, AUTH_MESSAGES[code] ?? 'We could not complete that sign-in. Try again.', error);
  }

  // Our own Cloud Functions return sentences written for players, so those are
  // passed through. Anything that still looks like SDK output is replaced -
  // a user must never see "INTERNAL ASSERTION FAILED" or a stack fragment.
  if (raw?.message && looksHumanWritten(raw.message)) {
    return build(code, raw.message.trim(), error);
  }

  return build(code, CODE_MESSAGES[code] ?? 'Something went wrong. Please try again.', error);
}

/**
 * Is this message safe to show a player?
 *
 * Our server messages are plain sentences. Raw SDK errors are recognisable by
 * shouty constant names, library prefixes and excessive length.
 */
function looksHumanWritten(message: string): boolean {
  const text = message.trim();
  if (text.length === 0 || text.length > 200) return false;
  // Library prefixes and internal diagnostics.
  if (/firebase|firestore|assertion|\binternal\b|exception|\bstack\b/i.test(text)) return false;
  // Error codes such as auth/wrong-password or PERMISSION_DENIED.
  if (/[a-z]+\/[a-z-]+/.test(text)) return false;
  if (/\b[A-Z][A-Z_]{3,}\b/.test(text)) return false;
  // A sentence, not a token dump.
  return /^[A-Z0-9"']/.test(text) && /\s/.test(text);
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
