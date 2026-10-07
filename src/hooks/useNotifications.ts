import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { watch } from '../firebase/firestore';
import { useAuth } from './useAuth';
import type { AppNotification, GameInvitation } from '../types/social';
import { showBrowserNotification } from '../utils/notifications';
import { play } from '../utils/sound';

export function useNotifications() {
  const { user, settings } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setInvitations([]);
      seen.current = new Set();
      primed.current = false;
      return;
    }
    const stopNotifications = watch.notifications(user.uid, (next) => {
      // Announce only genuinely new, unread notifications.
      if (primed.current) {
        next
          .filter((item) => !item.read && !seen.current.has(item.id))
          .forEach((item) => {
            play('notify');
            if (settings.browserNotifications) {
              showBrowserNotification(item.title, item.body, item.id);
            }
          });
      }
      next.forEach((item) => seen.current.add(item.id));
      primed.current = true;
      setNotifications(next);
    });
    const stopInvitations = watch.invitations(user.uid, setInvitations);
    return () => {
      stopNotifications();
      stopInvitations();
    };
  }, [user, settings.browserNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      if (!user) return;
      await updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => undefined);
    },
    [user],
  );

  const markAllRead = useCallback(async () => {
    await Promise.all(
      notifications.filter((item) => !item.read).map((item) => markRead(item.id)),
    );
  }, [notifications, markRead]);

  const dismiss = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id)).catch(() => undefined);
  }, []);

  return {
    notifications,
    invitations,
    unreadCount: notifications.filter((item) => !item.read).length,
    markRead,
    markAllRead,
    dismiss,
  };
}
