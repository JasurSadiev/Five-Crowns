/**
 * The "Something went wrong" regression.
 *
 * Deploying Hosting without Cloud Functions makes every callable return a 404
 * HTML page. That surfaced as a generic apology, which told the user nothing
 * and sent debugging in the wrong direction for a long time. These tests pin
 * the actionable message in place.
 */
import { describe, expect, it } from 'vitest';
import { BACKEND_MISSING, errorMessage, friendlyError, isBackendMissing } from '../utils/errors';

describe('backend-missing detection', () => {
  it('recognises the transport code', () => {
    expect(isBackendMissing({ code: BACKEND_MISSING })).toBe(true);
  });

  it('recognises the SDK reporting a missing callable', () => {
    expect(isBackendMissing({ code: 'functions/not-found' })).toBe(true);
  });

  it('recognises an HTML 404 page parsed as JSON', () => {
    expect(
      isBackendMissing({ message: `Unexpected token '<', "<!doctype "... is not valid JSON` }),
    ).toBe(true);
    expect(isBackendMissing({ message: '<html><head><title>404' })).toBe(true);
  });

  it('does not mistake ordinary failures for a missing backend', () => {
    expect(isBackendMissing({ code: 'permission-denied' })).toBe(false);
    expect(isBackendMissing({ code: 'not-found', message: 'We could not find that.' })).toBe(false);
    expect(isBackendMissing({ code: 'unauthenticated' })).toBe(false);
  });

  it('tells the user what to actually do', () => {
    const message = errorMessage({ code: 'functions/not-found' });
    expect(message).toMatch(/not been deployed/i);
    expect(message).toMatch(/deploy:functions/);
    // The old useless text must not come back.
    expect(message).not.toMatch(/^Something went wrong/);
  });

  it('still maps normal errors to friendly text', () => {
    expect(errorMessage({ code: 'permission-denied' })).toBe('You are not allowed to do that.');
    expect(errorMessage({ code: 'unauthenticated' })).toBe('Please sign in to continue.');
    expect(errorMessage({ code: 'auth/wrong-password' })).toBe(
      'That email and password do not match.',
    );
  });

  it('never leaks a raw Firebase error object', () => {
    const friendly = friendlyError({
      code: 'internal',
      message: 'FirebaseError: INTERNAL ASSERTION FAILED: xyz',
    });
    expect(friendly.message).not.toMatch(/ASSERTION/);
    expect(friendly.original).toBeDefined();
  });
});
