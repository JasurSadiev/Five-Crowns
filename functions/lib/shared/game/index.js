"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomInt = exports.secureRandom = exports.seededRandom = void 0;
/**
 * The Five Crowns rules engine.
 *
 * Pure TypeScript: no React, no Firebase, no I/O. The browser imports it for
 * instant feedback, the Cloud Functions import the very same files (copied by
 * `scripts/sync-engine.mjs`) to validate every action authoritatively.
 */
__exportStar(require("./cards"), exports);
__exportStar(require("./deck"), exports);
__exportStar(require("./rules"), exports);
__exportStar(require("./books"), exports);
__exportStar(require("./runs"), exports);
__exportStar(require("./combinations"), exports);
__exportStar(require("./scoring"), exports);
__exportStar(require("./turns"), exports);
var rng_1 = require("./rng");
Object.defineProperty(exports, "seededRandom", { enumerable: true, get: function () { return rng_1.seededRandom; } });
Object.defineProperty(exports, "secureRandom", { enumerable: true, get: function () { return rng_1.secureRandom; } });
Object.defineProperty(exports, "randomInt", { enumerable: true, get: function () { return rng_1.randomInt; } });
//# sourceMappingURL=index.js.map