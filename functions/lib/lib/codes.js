"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseCode = normaliseCode;
exports.reserveJoinCode = reserveJoinCode;
exports.releaseJoinCode = releaseJoinCode;
exports.lobbyIdForCode = lobbyIdForCode;
const node_crypto_1 = require("node:crypto");
const admin_1 = require("./admin");
const errors_1 = require("./errors");
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
function normaliseCode(input) {
    return input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}
function randomCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += ALPHABET[(0, node_crypto_1.randomInt)(ALPHABET.length)];
    }
    return code;
}
/** Reserves a unique code, retrying on the (very unlikely) collision. */
async function reserveJoinCode(lobbyId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = randomCode();
        const ref = admin_1.col.lobbyCode(code);
        const created = await admin_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists)
                return false;
            tx.set(ref, { lobbyId, createdAt: admin_1.FieldValue.serverTimestamp() });
            return true;
        });
        if (created)
            return code;
    }
    throw (0, errors_1.appError)('internal', 'internal', 'Could not allocate a lobby code. Please try again.');
}
async function releaseJoinCode(code) {
    if (!code)
        return;
    await admin_1.col.lobbyCode(code).delete().catch(() => undefined);
}
async function lobbyIdForCode(code) {
    const cleaned = code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!cleaned)
        return null;
    const snap = await admin_1.col.lobbyCode(cleaned).get();
    if (!snap.exists)
        return null;
    return snap.data()?.lobbyId ?? null;
}
//# sourceMappingURL=codes.js.map