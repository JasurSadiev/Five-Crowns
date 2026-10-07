import { useCallback, useEffect, useState } from 'react';
import { watch } from '../firebase/firestore';
import { api } from '../firebase/functions';
import { useAuth } from './useAuth';
import type { ChatMessage, Lobby } from '../types/game';

export interface UseLobbyResult {
  lobby: Lobby | null;
  chat: ChatMessage[];
  loading: boolean;
  error: string | null;
  isHost: boolean;
  isMember: boolean;
  canStart: boolean;
  busy: boolean;
  start: () => Promise<string | null>;
  leave: () => Promise<void>;
  kick: (uid: string) => Promise<void>;
  cancel: () => Promise<void>;
  invite: (uid: string) => Promise<void>;
  updateSettings: (patch: Record<string, unknown>, maxPlayers?: number) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

export function useLobby(lobbyId: string | undefined): UseLobbyResult {
  const { user } = useAuth();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!lobbyId) return;
    setLoading(true);
    const stopLobby = watch.lobby(
      lobbyId,
      (next) => {
        setLobby(next);
        setLoading(false);
        if (!next) setError('This lobby no longer exists.');
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    const stopChat = watch.lobbyChat(lobbyId, 50, setChat);
    return () => {
      stopLobby();
      stopChat();
    };
  }, [lobbyId]);

  const isHost = Boolean(user && lobby && lobby.hostId === user.uid);
  const isMember = Boolean(user && lobby?.playerIds?.includes(user.uid));
  const canStart = Boolean(isHost && lobby && lobby.playerIds.length >= 2 && lobby.status === 'open');

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try {
      return await action();
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    lobby,
    chat,
    loading,
    error,
    isHost,
    isMember,
    canStart,
    busy,
    start: async () => {
      if (!lobbyId) return null;
      const result = await run(() => api.startGame(lobbyId));
      return result?.gameId ?? null;
    },
    leave: async () => {
      if (!lobbyId) return;
      await run(() => api.leaveLobby(lobbyId));
    },
    kick: async (uid) => {
      if (!lobbyId) return;
      await run(() => api.kickPlayer(lobbyId, uid));
    },
    cancel: async () => {
      if (!lobbyId) return;
      await run(() => api.cancelLobby(lobbyId));
    },
    invite: async (uid) => {
      if (!lobbyId) return;
      await run(() => api.invitePlayer(lobbyId, uid));
    },
    updateSettings: async (patch, maxPlayers) => {
      if (!lobbyId) return;
      await run(() => api.updateLobbySettings({ lobbyId, settings: patch, maxPlayers }));
    },
    sendMessage: async (text) => {
      if (!lobbyId || !text.trim()) return;
      await api.sendChatMessage({ lobbyId, text: text.trim() });
    },
  };
}
