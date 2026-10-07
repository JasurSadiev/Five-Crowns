import { FieldValue, col, db } from './admin';
import type { NotificationType } from '../shared/types/social';

export interface NotifyInput {
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  icon?: string | null;
  link?: string | null;
  data?: Record<string, string>;
}

/** Creates an in-app notification. Never throws into the caller's flow. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await col.notifications().add({
      uid: input.uid,
      type: input.type,
      title: input.title,
      body: input.body,
      icon: input.icon ?? null,
      link: input.link ?? null,
      read: false,
      data: input.data ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Notifications are best effort - they must never break gameplay.
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    const batch = db.batch();
    for (const input of inputs) {
      batch.set(col.notifications().doc(), {
        uid: input.uid,
        type: input.type,
        title: input.title,
        body: input.body,
        icon: input.icon ?? null,
        link: input.link ?? null,
        read: false,
        data: input.data ?? {},
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  } catch {
    /* best effort */
  }
}
