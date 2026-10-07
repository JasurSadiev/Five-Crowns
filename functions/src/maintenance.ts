import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { FieldValue, Timestamp, col, db } from './lib/admin';
import { releaseJoinCode } from './lib/codes';
import { autoPlayTurn, currentPlayerId, type RoundState } from './shared/game';

/** Closes lobbies that nobody ever started. */
export const cleanupExpiredLobbies = onSchedule('every 30 minutes', async () => {
  const cutoff = Timestamp.fromMillis(Date.now());
  const snap = await col
    .lobbies()
    .where('status', '==', 'open')
    .where('expiresAt', '<', cutoff)
    .limit(200)
    .get();

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: 'closed', updatedAt: FieldValue.serverTimestamp() });
    await releaseJoinCode(doc.data().joinCode as string);
  }
  if (!snap.empty) await batch.commit();
  logger.info(`cleanupExpiredLobbies closed ${snap.size} lobbies`);
});

/** Expires invitations nobody answered. */
export const cleanupExpiredInvitations = onSchedule('every 30 minutes', async () => {
  const snap = await col
    .invitations()
    .where('status', '==', 'pending')
    .where('expiresAt', '<', Timestamp.now())
    .limit(400)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { status: 'expired' }));
  await batch.commit();
  logger.info(`cleanupExpiredInvitations expired ${snap.size} invitations`);
});

/**
 * Safety net for abandoned turns. The in-game clients also call
 * `enforceTurnTimeout`, but this keeps games moving even when every browser
 * is closed.
 */
export const enforceTurnDeadlines = onSchedule('every 2 minutes', async () => {
  const snap = await col
    .games()
    .where('status', '==', 'playing')
    .where('turnDeadline', '<', Timestamp.now())
    .limit(40)
    .get();

  for (const doc of snap.docs) {
    const gameId = doc.id;
    try {
      await db.runTransaction(async (tx) => {
        const gameRef = col.game(gameId);
        const secretRef = col.gameSecret(gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists) return;
        const game = gameSnap.data() as {
          status: string;
          turnDeadline: FirebaseFirestore.Timestamp | null;
          settings: { turnTimeoutSeconds: number };
        };
        if (game.status !== 'playing') return;
        if (!game.turnDeadline || game.turnDeadline.toMillis() > Date.now()) return;
        const state = (secretSnap.data() as { state: RoundState }).state;
        const target = currentPlayerId(state);
        if (!target) return;
        const result = autoPlayTurn(state, target);
        if (!result.ok) return;
        tx.set(secretRef, { state: result.state }, { merge: true });
        tx.update(gameRef, {
          turnDeadline: Timestamp.fromMillis(
            Date.now() + (game.settings?.turnTimeoutSeconds ?? 120) * 1000,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      logger.error('enforceTurnDeadlines failed', { gameId, error });
    }
  }
});

/** Marks stale presence heartbeats as offline. */
export const sweepPresence = onSchedule('every 10 minutes', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
  const snap = await col
    .users()
    .where('isOnline', '==', true)
    .where('lastSeenAt', '<', cutoff)
    .limit(300)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { isOnline: false, presence: 'offline' }));
  await batch.commit();
});
