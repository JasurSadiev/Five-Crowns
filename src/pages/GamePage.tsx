import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  DoorOpen,
  Eye,
  LayoutGrid,
  MessageSquare,
  ScrollText,
  Table2,
  WifiOff,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Panel,
  ScreenLoader,
  Tabs,
} from '../components/common';
import { GameTable } from '../components/game/GameTable';
import { HandView } from '../components/game/HandView';
import { ActionBar } from '../components/game/ActionBar';
import { RoundResults } from '../components/game/RoundResults';
import { FinalCelebration } from '../components/game/FinalCelebration';
import { Scoreboard } from '../components/game/Scoreboard';
import { EventLog } from '../components/game/EventLog';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useGame } from '../hooks/useGame';
import { useAuth } from '../hooks/useAuth';
import { useCountdown } from '../hooks/useCountdown';
import { useToast } from '../hooks/useToast';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { api } from '../firebase/functions';
import { play } from '../utils/sound';
import { cn } from '../utils/cn';

type SidePanel = 'scores' | 'chat' | 'log';

export default function GamePage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, settings } = useAuth();
  const { online } = useOnlineStatus();
  const isDesktop = useIsDesktop();

  const game = useGame(gameId, { withChat: true });
  const [panel, setPanel] = useState<SidePanel>('scores');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const turnSeconds = useCountdown(game.game?.turnDeadline ?? null);
  const nextRoundSeconds = useCountdown(game.game?.nextRoundAt ?? null);
  const wasMyTurn = useRef(false);
  const timeoutFired = useRef<number>(0);

  /* ---- sound + title cues when the turn comes round ---- */
  useEffect(() => {
    if (game.isMyTurn && !wasMyTurn.current) {
      play('turn');
      document.title = 'Your turn! · Five Crowns';
    } else if (!game.isMyTurn && wasMyTurn.current) {
      document.title = 'Five Crowns';
    }
    wasMyTurn.current = game.isMyTurn;
    return () => {
      document.title = 'Five Crowns';
    };
  }, [game.isMyTurn]);

  /* ---- any player may ask the server to enforce an expired deadline ---- */
  useEffect(() => {
    if (!game.game || game.game.status !== 'playing') return;
    if (turnSeconds === null || turnSeconds > 0) return;
    const now = Date.now();
    if (now - timeoutFired.current < 10000) return;
    timeoutFired.current = now;
    void game.enforceTimeout();
  }, [turnSeconds, game]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!game.isMyTurn) return;
      if (event.key === 'd' && game.canDraw) void game.drawFromStock();
      if (event.key === 't' && game.canDraw) void game.takeDiscard();
      if (event.key === 'Enter' && game.canDiscard && game.selected.length === 1) {
        void game.discard(game.selected[0]);
      }
      if (event.key === 'Escape') game.clearSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const latestRound = useMemo(() => {
    if (!game.rounds.length) return null;
    return [...game.rounds].sort((a, b) => b.roundNumber - a.roundNumber)[0];
  }, [game.rounds]);

  if (game.loading) return <ScreenLoader label="Taking a seat at the table…" />;

  if (!game.game) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="That table isn't available"
          description={
            game.error ??
            'The game may have finished, or it is private and you are not one of the players.'
          }
          action={<Button onClick={() => navigate('/home')}>Back home</Button>}
        />
      </div>
    );
  }

  const data = game.game;
  const currentName =
    game.players.find((player) => player.uid === data.currentPlayerId)?.displayName ?? null;

  const finished = data.status === 'finished';
  const roundComplete = data.status === 'round_complete';

  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={panel}
        onChange={setPanel}
        className="mb-3 w-full"
        tabs={[
          { id: 'scores', label: 'Scores' },
          { id: 'chat', label: 'Chat' },
          { id: 'log', label: 'Log' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {panel === 'scores' ? (
          <div className="h-full overflow-y-auto">
            <Scoreboard
              game={data}
              players={game.players}
              rounds={game.rounds}
              selfUid={user?.uid ?? null}
            />
            <p className="mt-4 rounded-lg bg-ink/5 p-3 text-xs text-ink-muted dark:bg-white/5">
              Lowest total wins after round 11. Going out scores zero for that round.
            </p>
          </div>
        ) : panel === 'chat' ? (
          <ChatPanel
            messages={game.chat}
            onSend={game.sendMessage}
            selfUid={user?.uid ?? null}
            disabled={!data.settings.enableChat}
          />
        ) : (
          <EventLog events={game.events} />
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-4">
      {/* status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={finished ? 'gold' : data.status === 'playing' ? 'green' : 'neutral'}>
          {finished
            ? 'Final results'
            : roundComplete
              ? 'Round complete'
              : `Round ${data.currentRound} of 11`}
        </Badge>

        {game.isSpectator ? (
          <Badge tone="blue">
            <Eye className="h-3 w-3" /> Spectating
          </Badge>
        ) : null}

        {!online ? (
          <Badge tone="red">
            <WifiOff className="h-3 w-3" /> Offline — actions paused
          </Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {!isDesktop ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<LayoutGrid className="h-4 w-4" />}
              onClick={() => setMobilePanelOpen(true)}
            >
              Scores & chat
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            icon={<DoorOpen className="h-4 w-4" />}
            onClick={() => setLeaveOpen(true)}
          >
            Leave
          </Button>
        </div>
      </div>

      {finished ? (
        <FinalCelebration
          game={data}
          players={game.players}
          rounds={game.rounds}
          selfUid={user?.uid ?? null}
        />
      ) : (
        <div className={cn('grid gap-4', isDesktop && 'grid-cols-[1fr_340px]')}>
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {roundComplete ? (
                <RoundResults
                  key="results"
                  game={data}
                  summary={latestRound}
                  selfUid={user?.uid ?? null}
                  isHost={data.hostId === user?.uid}
                  countdown={nextRoundSeconds}
                  busy={game.busy}
                  onContinue={() =>
                    void game.advanceRound().catch((error) => toast.error(error, 'Could not continue'))
                  }
                />
              ) : (
                <motion.div
                  key="table"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <GameTable
                    game={data}
                    players={game.players}
                    selfUid={user?.uid ?? null}
                    secondsLeft={turnSeconds}
                    canDraw={game.canDraw && online}
                    onDrawStock={() =>
                      void game.drawFromStock().catch((error) => toast.error(error))
                    }
                    onTakeDiscard={() =>
                      void game.takeDiscard().catch((error) => toast.error(error))
                    }
                    busy={game.busy}
                    compact={!isDesktop}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* own seat: hand + actions */}
            {!game.isSpectator && !roundComplete ? (
              <div className="rounded-3xl border border-white/10 bg-felt-900/80 p-4 shadow-glass backdrop-blur-sm">
                <HandView
                  cards={game.hand}
                  wildRank={data.wildRank}
                  selected={game.selected}
                  onToggle={game.toggleSelect}
                  onReorder={game.setOrder}
                  sortMode={game.sortMode}
                  onSortMode={game.setSortMode}
                  size={settings.largeCards ? 'lg' : isDesktop ? 'md' : 'sm'}
                  disabled={!online}
                  onDoubleClick={(cardId) => {
                    if (game.canDiscard && online) void game.discard(cardId).catch((error) => toast.error(error));
                  }}
                  emptyLabel={
                    data.wentOutBy === user?.uid
                      ? 'You went out — nothing left to play.'
                      : 'Waiting for the deal…'
                  }
                />
                <div className="mt-3 border-t border-white/10 pt-3">
                  <ActionBar
                    wildRank={data.wildRank}
                    isMyTurn={game.isMyTurn && online}
                    phase={data.turnPhase}
                    selected={game.selected}
                    hand={game.hand}
                    analysis={game.analysis}
                    busy={game.busy}
                    confirmDiscard={settings.confirmDiscard}
                    onDiscard={(cardId) =>
                      void game.discard(cardId).catch((error) => toast.error(error))
                    }
                    onGoOut={(cardId, melds) =>
                      void game.goOut(cardId, melds).catch((error) => toast.error(error, 'Could not go out'))
                    }
                    onClearSelection={game.clearSelection}
                    waitingFor={currentName}
                  />
                </div>
                <p className="mt-2 text-center text-[11px] text-white/35">
                  Shortcuts: D draw · T take discard · Enter discard selected · Esc clear
                </p>
              </div>
            ) : null}

            {game.isSpectator && !roundComplete ? (
              <Panel className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-sky-400" aria-hidden />
                <p className="text-sm text-ink-muted">
                  You are watching this table. Hands stay hidden from spectators — you'll see the
                  melds when each round is scored.
                </p>
              </Panel>
            ) : null}
          </div>

          {isDesktop ? (
            <Panel className="flex h-[640px] flex-col">{sidePanel}</Panel>
          ) : null}
        </div>
      )}

      {/* mobile side panel */}
      <AnimatePresence>
        {mobilePanelOpen && !isDesktop ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end"
          >
            <div
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setMobilePanelOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="relative max-h-[80dvh] w-full rounded-t-3xl border-t border-line bg-surface-raised p-4"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
              <div className="h-[60dvh]">{sidePanel}</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* leave confirmation */}
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave this table?"
        description={
          game.isSpectator
            ? 'You can come back and watch at any time.'
            : 'Your seat stays in the game and the turn timer keeps running. Come back any time to pick it up.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (gameId) await api.leaveGame(gameId).catch(() => undefined);
                navigate('/home');
              }}
            >
              Leave table
            </Button>
          </>
        }
      />

      {/* tiny floating indicators for mobile */}
      {!isDesktop && !finished ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2">
          <button
            type="button"
            onClick={() => {
              setPanel('chat');
              setMobilePanelOpen(true);
            }}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-raised/90 text-ink-muted shadow-glass backdrop-blur"
            aria-label="Open chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel('scores');
              setMobilePanelOpen(true);
            }}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-raised/90 text-ink-muted shadow-glass backdrop-blur"
            aria-label="Open scores"
          >
            <Table2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel('log');
              setMobilePanelOpen(true);
            }}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-raised/90 text-ink-muted shadow-glass backdrop-blur"
            aria-label="Open table log"
          >
            <ScrollText className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
