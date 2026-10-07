"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notify = notify;
exports.notifyMany = notifyMany;
const admin_1 = require("./admin");
/** Creates an in-app notification. Never throws into the caller's flow. */
async function notify(input) {
    try {
        await admin_1.col.notifications().add({
            uid: input.uid,
            type: input.type,
            title: input.title,
            body: input.body,
            icon: input.icon ?? null,
            link: input.link ?? null,
            read: false,
            data: input.data ?? {},
            createdAt: admin_1.FieldValue.serverTimestamp(),
        });
    }
    catch {
        // Notifications are best effort - they must never break gameplay.
    }
}
async function notifyMany(inputs) {
    if (!inputs.length)
        return;
    try {
        const batch = admin_1.db.batch();
        for (const input of inputs) {
            batch.set(admin_1.col.notifications().doc(), {
                uid: input.uid,
                type: input.type,
                title: input.title,
                body: input.body,
                icon: input.icon ?? null,
                link: input.link ?? null,
                read: false,
                data: input.data ?? {},
                createdAt: admin_1.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
    }
    catch {
        /* best effort */
    }
}
//# sourceMappingURL=notify.js.map