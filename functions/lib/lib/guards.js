"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireString = requireString;
exports.optionalString = optionalString;
exports.requireNumber = requireNumber;
exports.requireBoolean = requireBoolean;
exports.rateLimit = rateLimit;
exports.pairKey = pairKey;
exports.validateUsername = validateUsername;
exports.rememberRequest = rememberRequest;
exports.alreadyProcessed = alreadyProcessed;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./admin");
const errors_1 = require("./errors");
/**
 * Asserts the caller is signed in and returns their uid.
 *
 * This throws an HttpsError rather than an AppError on purpose: every callable
 * evaluates `requireAuth(request)` as an *argument* to the wrapped handler, so
 * it runs outside that handler's try/catch. An AppError thrown here would be
 * reported to the browser as a bare INTERNAL instead of `unauthenticated`.
 */
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', (0, errors_1.friendlyMessage)('unauthenticated'), {
            code: 'unauthenticated',
        });
    }
    return uid;
}
function requireString(value, field, max = 200) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', `${field} is required.`);
    }
    if (value.length > max) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', `${field} is too long.`);
    }
    return value.trim();
}
function optionalString(value, max = 200) {
    if (value === undefined || value === null || value === '')
        return null;
    if (typeof value !== 'string' || value.length > max) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', 'Invalid value.');
    }
    return value.trim();
}
function requireNumber(value, field, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', `${field} must be ${min}-${max}.`);
    }
    return num;
}
function requireBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
/**
 * Fixed-window rate limiter backed by a single Firestore document per
 * (user, action). Used for chat, invitations, lobby creation and reports.
 */
async function rateLimit(uid, action, limit, windowMs) {
    const ref = admin_1.col.rateLimit(`${uid}__${action}`);
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    await admin_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        if (data && data.window === windowStart) {
            if ((data.count ?? 0) >= limit) {
                throw (0, errors_1.appError)('rate_limited', 'resource-exhausted');
            }
            tx.update(ref, { count: admin_1.FieldValue.increment(1), updatedAt: admin_1.FieldValue.serverTimestamp() });
        }
        else {
            tx.set(ref, {
                window: windowStart,
                count: 1,
                action,
                uid,
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
        }
    });
}
/** Deterministic key for a friendship / block relationship between two users. */
function pairKey(a, b) {
    return [a, b].sort().join('_');
}
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
function validateUsername(name) {
    const trimmed = name.trim();
    if (!USERNAME_RE.test(trimmed))
        throw (0, errors_1.appError)('invalid_username', 'invalid-argument');
    return trimmed;
}
/** Keeps a bounded map of handled request ids so a replayed action is a no-op. */
function rememberRequest(processed, requestId) {
    const next = { ...(processed ?? {}) };
    if (requestId)
        next[requestId] = Date.now();
    const entries = Object.entries(next);
    if (entries.length > 40) {
        entries.sort((a, b) => b[1] - a[1]);
        return Object.fromEntries(entries.slice(0, 40));
    }
    return next;
}
function alreadyProcessed(processed, requestId) {
    if (!requestId || !processed)
        return false;
    return Object.prototype.hasOwnProperty.call(processed, requestId);
}
//# sourceMappingURL=guards.js.map