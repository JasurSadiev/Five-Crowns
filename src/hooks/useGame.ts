import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { watch } from '../firebase/firestore';
import { api, newRequestId } from '../firebase/functions';
import { useAuth } from './useAuth';
import type {
  ChatMessage,
  Game,
  GameEvent,
  GamePlayerPublic,
  PlayerHand,
  RoundSummary,
} from '../types/game';
import type { Card, Meld } from '../types/card';
import { applyOrder, findValidCombinations, sortByRank, sortBySuit } from '../game';
import type { CombinationAnalysis } from '../game/combinations';

export type SortMode = 'manual' | 'rank' | 'suit';

export interface UseGameResult {
  game: Game | null;
  players: GamePlayerPublic[];
  hand: Card[];
  rawHand: PlayerHand | null;
  rounds: RoundSummary[];
  events: GameEvent[];
  chat: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** The signed-in player's seat, or null when spectating. */
  me: GamePlayerPublic | null;
  isSpectator: boolean;
  isMyTurn: boolean;
  canDraw: boolean;
  canDiscard: boolean;
  analysis: CombinationAnalysis | null;
  selected: string[];
  toggleSelect: (cardId: string) => void;
  clearSelection: () => void;
  setOrder: (ids: string[]) => void;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  busy: boolean;
  drawFromStock: () => Promise<void>;
  takeDiscard: () => Promise<void>;
  discard: (cardId: string) => Promise<void>;
  goOut: (cardId: string, melds?: Meld[]) => Promise<void>;
  advanceRound: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  enforceTimeout: () => Promise<void>;
}

/**
 * Subscribes to everything the table needs, in four selective listeners:
 * the public game document, the public player list, this player's private
 * hand and (optionally) chat. Nothing else is ever downloaded.
 */
export function useGame(gameId: string | undefined, options: { withChat?: boolean } = {}): UseGameResult {
  const { user, settings } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<GamePlayerPublic[]>([]);
  const [rawHand, setRawHand] = useState<PlayerHand | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>(settings.autoSortCards ? 'rank' : 'manual');
  const [busy, setBusy] = useState(false);
  const [order, setLocalOrder] = useState<string[]>([]);
  const lastRound = useRef<number>(0);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    const stops = [
      watch.game(
        gameId,
        (next) => {
          setGame(next);
          setLoading(false);
          if (!next) setError('That game could not be found.');
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
      ),
      watch.gamePlayers(gameId, setPlayers),
      watch.rounds(gameId, setRounds),
      watch.events(gameId, 40, setEvents),
    ];
    if (options.withChat) stops.push(watch.gameChat(gameId, 60, setChat));
    return () => stops.forEach((stop) => stop());
  }, [gameId, options.withChat]);

  useEffect(() => {
    if (!gameId || !user) return;
    return watch.hand(gameId, user.uid, setRawHand);
  }, [gameId, user]);

  // A fresh deal clears any leftover selection and manual ordering.
  useEffect(() => {
    if (!game) return;
    if (game.currentRound !== lastRound.current) {
      lastRound.current = game.currentRound;
      setSelected([]);
      setLocalOrder([]);
    }
  }, [game]);

  // Keep the table marked as "online" while this tab is open.
  useEffect(() => {
    if (!gameId || !user || !game) return;
    if (game.status === 'finished' || game.status === 'cancelled') return;
    void api.pingGame(gameId).catch(() => undefined);
    const timer = setInterval(() => void api.pingGame(gameId).catch(() => undefined), 45000);
    return () => clearInterval(timer);
  }, [gameId, user, game?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const wildRank = game?.wildRank ?? 3;

  const hand = useMemo(() => {
    const cards = rawHand?.cards ?? [];
    if (!cards.length) return [];
    if (sortMode === 'rank') return sortByRank(cards, wildRank);
    if (sortMode === 'suit') return sortBySuit(cards, wildRank);
    const preferred = order.length ? order : (rawHand?.order ?? []);
    return applyOrder(cards, preferred);
  }, [rawHand, sortMode, order, wildRank]);

  const analysis = useMemo(() => {
    if (!hand.length) return null;
    return findValidCombinations(hand, wildRank);
  }, [hand, wildRank]);

  const me = useMemo(
    () => players.find((player) => player.uid === user?.uid) ?? null,
    [players, user],
  );
  const isSpectator = Boolean(user && game && !game.playerIds.includes(user.uid));
  const isMyTurn = Boolean(user && game?.currentPlayerId === user.uid && game?.status === 'playing');
  const canDraw = isMyTurn && game?.turnPhase === 'draw';
  const canDiscard = isMyTurn && game?.turnPhase === 'discard';

  const toggleSelect = useCallback((cardId: string) => {
    setSelected((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    );
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  const setOrder = useCallback(
    (ids: string[]) => {
      setSortMode('manual');
      setLocalOrder(ids);
      if (gameId && user) {
        // Purely cosmetic: the only field a client may write on its own hand.
        void updateDoc(doc(db, 'games', gameId, 'hands', user.uid), { order: ids }).catch(
          () => undefined,
        );
      }
    },
    [gameId, user],
  );

  const guard = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const drawFromStock = useCallback(async () => {
    if (!gameId) return;
    await guard(() => api.drawCard(gameId, newRequestId()));
  }, [gameId, guard]);

  const takeDiscard = useCallback(async () => {
    if (!gameId) return;
    await guard(() => api.takeDiscard(gameId, newRequestId()));
  }, [gameId, guard]);

  const discard = useCallback(
    async (cardId: string) => {
      if (!gameId) return;
      await guard(async () => {
        await api.discardCard({ gameId, cardId, requestId: newRequestId() });
        setSelected([]);
      });
    },
    [gameId, guard],
  );

  const goOut = useCallback(
    async (cardId: string, melds?: Meld[]) => {
      if (!gameId) return;
      await guard(async () => {
        await api.goOut({
          gameId,
          cardId,
          requestId: newRequestId(),
          melds: melds?.map((meld) => ({
            type: meld.type,
            cards: meld.cards.map((card) => ({ id: card.id })),
          })),
        });
        setSelected([]);
      });
    },
    [gameId, guard],
  );

  const advanceRound = useCallback(async () => {
    if (!gameId) return;
    await guard(() => api.advanceRound(gameId));
  }, [gameId, guard]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!gameId || !text.trim()) return;
      await api.sendChatMessage({ gameId, text: text.trim() });
    },
    [gameId],
  );

  const enforceTimeout = useCallback(async () => {
    if (!gameId) return;
    await api.enforceTurnTimeout(gameId).catch(() => undefined);
  }, [gameId]);

  return {
    game,
    players: [...players].sort((a, b) => a.seat - b.seat),
    hand,
    rawHand,
    rounds,
    events,
    chat,
    loading,
    error,
    me,
    isSpectator,
    isMyTurn,
    canDraw,
    canDiscard,
    analysis,
    selected,
    toggleSelect,
    clearSelection,
    setOrder,
    sortMode,
    setSortMode,
    busy,
    drawFromStock,
    takeDiscard,
    discard,
    goOut,
    advanceRound,
    sendMessage,
    enforceTimeout,
  };
}
