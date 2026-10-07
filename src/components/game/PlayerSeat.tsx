import { memo } from 'react';
import { motion } from 'framer-motion';
import { Crown, Hourglass, WifiOff } from 'lucide-react';
import type { GamePlayerPublic } from '../../types/game';
import { Avatar } from '../common';
import { CardBack } from '../cards/PlayingCard';
import { cn } from '../../utils/cn';

interface PlayerSeatProps {
  player: GamePlayerPublic;
  isCurrent: boolean;
  isDealer: boolean;
  isSelf: boolean;
  compact?: boolean;
  secondsLeft?: number | null;
  timeoutSeconds?: number;
}

/**
 * One opponent around the table. Shows the number of cards face-down - never
 * their faces - plus presence, score and whose turn it is.
 */
export const PlayerSeat = memo(function PlayerSeat({
  player,
  isCurrent,
  isDealer,
  isSelf,
  compact,
  secondsLeft,
  timeoutSeconds = 120,
}: PlayerSeatProps): JSX.Element {
  const fanned = Math.min(player.cardCount, 7);
  const urgent = isCurrent && typeof secondsLeft === 'number' && secondsLeft <= 15;
  const progress =
    isCurrent && typeof secondsLeft === 'number'
      ? Math.max(0, Math.min(1, secondsLeft / Math.max(1, timeoutSeconds)))
      : null;

  return (
    <motion.div
      layout
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2 transition-colors',
        isCurrent ? 'bg-gold-400/10 ring-1 ring-gold-400/50' : 'bg-black/20 ring-1 ring-white/5',
        player.connection === 'disconnected' && 'opacity-60',
      )}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* mini fan of face-down cards */}
      {!compact ? (
        <div className="relative mb-0.5 flex h-7 items-end justify-center" aria-hidden>
          {Array.from({ length: fanned }).map((_, index) => (
            <CardBack
              key={index}
              size="xs"
              className="absolute origin-bottom"
              style={{
                transform: `translateX(${(index - (fanned - 1) / 2) * 9}px) rotate(${
                  (index - (fanned - 1) / 2) * 5
                }deg)`,
                width: 20,
                height: 28,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Avatar
          name={player.displayName}
          src={player.photoURL}
          size={compact ? 32 : 42}
          presence={player.connection === 'online' ? 'online' : player.connection}
          ring={isCurrent}
        />
        {progress !== null ? (
          <svg
            className="pointer-events-none absolute -inset-1"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth="5"
              className={urgent ? 'stroke-rose-400' : 'stroke-gold-400'}
              strokeLinecap="round"
              strokeDasharray={289}
              strokeDashoffset={289 * (1 - progress)}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        ) : null}
        {isDealer ? (
          <span
            title="Dealer"
            className="absolute -left-1.5 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-felt-900 shadow"
          >
            D
          </span>
        ) : null}
        {player.hasGoneOut ? (
          <span
            title="Went out"
            className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-felt-950 shadow"
          >
            <Crown className="h-3 w-3" />
          </span>
        ) : null}
      </div>

      <div className="max-w-[108px] text-center">
        <p
          className={cn(
            'truncate text-xs font-semibold',
            isCurrent ? 'text-gold-200' : 'text-white/85',
          )}
        >
          {player.displayName}
          {isSelf ? <span className="text-white/50"> (you)</span> : null}
        </p>
        <p className="flex items-center justify-center gap-1 text-[11px] text-white/55">
          <span>{player.cardCount} cards</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{player.totalScore} pts</span>
        </p>
      </div>

      {player.connection === 'disconnected' ? (
        <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-200">
          <WifiOff className="h-3 w-3" /> Reconnecting
        </span>
      ) : isCurrent ? (
        <span className="flex items-center gap-1 rounded-full bg-gold-400/20 px-2 py-0.5 text-[10px] font-medium text-gold-200">
          <Hourglass className="h-3 w-3" />
          {typeof secondsLeft === 'number' ? `${secondsLeft}s` : 'Thinking'}
        </span>
      ) : null}
    </motion.div>
  );
});
