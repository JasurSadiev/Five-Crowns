import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { Game, GamePlayerPublic } from '../../types/game';
import { PlayerSeat } from './PlayerSeat';
import { CardPile, CardSlot, PlayingCard } from '../cards/PlayingCard';
import { rankLabel, rankName } from '../../game/cards';
import { cn } from '../../utils/cn';

interface GameTableProps {
  game: Game;
  players: GamePlayerPublic[];
  selfUid: string | null;
  secondsLeft: number | null;
  canDraw: boolean;
  onDrawStock: () => void;
  onTakeDiscard: () => void;
  busy: boolean;
  compact?: boolean;
}

/**
 * The felt table.
 *
 * Opponents are positioned on an ellipse with the local player anchored at the
 * bottom (seat rotation), which keeps the classic card-table feel at any player
 * count from 2 to 7. On small screens the ellipse collapses into a scrollable
 * row so nothing overlaps.
 */
export const GameTable = memo(function GameTable({
  game,
  players,
  selfUid,
  secondsLeft,
  canDraw,
  onDrawStock,
  onTakeDiscard,
  busy,
  compact,
}: GameTableProps): JSX.Element {
  const order = game.turnOrder.length ? game.turnOrder : players.map((player) => player.uid);
  const selfIndex = selfUid ? order.indexOf(selfUid) : -1;

  // Rotate so that the local player sits at the bottom of the ellipse.
  const seated = order
    .map((uid) => players.find((player) => player.uid === uid))
    .filter((player): player is GamePlayerPublic => Boolean(player));
  const rotated =
    selfIndex >= 0 ? [...seated.slice(selfIndex), ...seated.slice(0, selfIndex)] : seated;
  const others = selfIndex >= 0 ? rotated.slice(1) : rotated;

  const dealerId = game.turnOrder[game.dealerIndex] ?? null;

  const discardCard = game.discardTop?.card ?? null;
  const canTakeDiscard = canDraw && Boolean(discardCard);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-white/10 bg-felt-table shadow-[inset_0_2px_40px_rgba(0,0,0,0.45)]',
        compact ? 'p-4' : 'p-5 sm:p-8',
      )}
    >
      {/* felt texture + vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)',
          backgroundSize: '7px 7px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{ boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.42)' }}
      />

      {/* opponents */}
      <div
        className={cn(
          'relative z-10',
          compact
            ? 'flex gap-2 overflow-x-auto pb-2'
            : 'flex flex-wrap items-start justify-center gap-2 sm:gap-3',
        )}
      >
        {others.map((player) => (
          <PlayerSeat
            key={player.uid}
            player={player}
            isCurrent={game.currentPlayerId === player.uid}
            isDealer={dealerId === player.uid}
            isSelf={false}
            compact={compact}
            secondsLeft={game.currentPlayerId === player.uid ? secondsLeft : null}
            timeoutSeconds={game.settings.turnTimeoutSeconds}
          />
        ))}
      </div>

      {/* centre: round marker, stock, discard */}
      <div className="relative z-10 mt-5 flex flex-col items-center gap-4 sm:mt-8">
        <div className="flex items-center gap-2 rounded-full border border-gold-400/25 bg-black/30 px-4 py-1.5 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 text-gold-300" aria-hidden />
          <span className="text-xs font-medium text-white/80">
            Round {game.currentRound}
            {game.isTieBreakRound ? ' · tie-break' : ` of 11`}
          </span>
          <span className="h-3 w-px bg-white/20" aria-hidden />
          <span className="text-xs font-semibold text-gold-200">
            {rankLabel(game.wildRank)}s wild
          </span>
        </div>

        <div className="flex items-end gap-6 sm:gap-10">
          <div className="flex flex-col items-center gap-2">
            <CardPile
              count={game.drawPileCount}
              size={compact ? 'sm' : 'md'}
              label="Draw pile"
              onClick={canDraw && !busy ? onDrawStock : undefined}
              disabled={!canDraw || busy || game.drawPileCount === 0}
            />
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/55">
              Stock · {game.drawPileCount}
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <AnimatePresence mode="popLayout">
                {discardCard ? (
                  <motion.div
                    key={discardCard.id}
                    initial={{ opacity: 0, y: -24, rotate: -8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  >
                    <PlayingCard
                      card={discardCard}
                      wildRank={game.wildRank}
                      size={compact ? 'sm' : 'md'}
                      interactive={canTakeDiscard}
                      disabled={!canTakeDiscard || busy}
                      onClick={canTakeDiscard && !busy ? onTakeDiscard : undefined}
                      className={cn(canTakeDiscard && 'ring-2 ring-emerald-400/70')}
                    />
                  </motion.div>
                ) : (
                  <CardSlot key="empty" size={compact ? 'sm' : 'md'} label="Discard" />
                )}
              </AnimatePresence>
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/55">
              Discard · {game.discardPileCount}
            </span>
          </div>
        </div>

        {game.wentOutBy ? (
          <p className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
            {players.find((player) => player.uid === game.wentOutBy)?.displayName ?? 'Someone'} went
            out — {game.finalTurnsRemaining.length} final{' '}
            {game.finalTurnsRemaining.length === 1 ? 'turn' : 'turns'} left
          </p>
        ) : (
          <p className="text-center text-[11px] text-white/40">
            {rankName(game.wildRank)}s and jokers are wild this round ·{' '}
            {game.cardsThisRound} cards dealt
          </p>
        )}
      </div>
    </div>
  );
});
