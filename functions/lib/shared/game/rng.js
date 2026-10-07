"use strict";
/**
 * Randomness used for shuffling.
 *
 * Shuffling only ever happens inside trusted server code, so the default
 * implementation prefers a CSPRNG (`crypto.getRandomValues`, available both in
 * Node 20 and in modern browsers) and falls back to `Math.random` only when no
 * crypto implementation exists.
 *
 * A deterministic generator is provided so the engine can be unit tested with
 * reproducible shuffles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.secureRandom = void 0;
exports.randomInt = randomInt;
exports.seededRandom = seededRandom;
function getCrypto() {
    const g = globalThis;
    if (g.crypto && typeof g.crypto.getRandomValues === 'function')
        return g.crypto;
    return null;
}
/** Cryptographically secure float in [0, 1). */
const secureRandom = () => {
    const crypto = getCrypto();
    if (!crypto)
        return Math.random();
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0x1_0000_0000;
};
exports.secureRandom = secureRandom;
/**
 * Unbiased integer in [0, max) using rejection sampling, so that the modulo
 * bias cannot skew a shuffle.
 */
function randomInt(max, random = exports.secureRandom) {
    if (max <= 0)
        throw new Error('randomInt: max must be > 0');
    if (random === exports.secureRandom) {
        const crypto = getCrypto();
        if (crypto) {
            const limit = Math.floor(0x1_0000_0000 / max) * max;
            const buffer = new Uint32Array(1);
            for (;;) {
                crypto.getRandomValues(buffer);
                if (buffer[0] < limit)
                    return buffer[0] % max;
            }
        }
    }
    return Math.floor(random() * max) % max;
}
/** Mulberry32 - small, fast, deterministic PRNG for tests and replays. */
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
//# sourceMappingURL=rng.js.map