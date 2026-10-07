import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Medal, RotateCcw, Share2, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Game, GamePlayerPublic, RoundSummary } from '../../types/game';
import { Avatar, Button } from '../common';
import { ordinal } from '../../utils/formatting';
import { cn } from '../../utils/cn';
import { play } from '../../utils/sound';

const CONFETTI_COLORS = ['#e9b534', '#15795a', '#dc2626', '#4f46e5', '#ea580c', '#f8fafc'];

function Confetti({ count = 70 }: { count?: number }): JSX.Element {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.8 + Math.random() * 2.4,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
        rotate: Math.random() * 360,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          initial={{ y: -40, opacity: 0, rotate: piece.rotate }}
          animate={{ y: '110%', opacity: [0, 1, 1, 0], rotate: piece.rotate + 360 }}
          transition={{ duration: piece.duration, delay: piece.delay, repeat: Infinity, ease: 'linear' }}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 1.6,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </div>
  );
}

export function FinalCelebration({
  game,
  players,
  rounds,
  selfUid,
}: {
  game: Game;
  players: GamePlayerPublic[];
  rounds: RoundSummary[];
  selfUid: string | null;
}): JSX.Element {
  const [showConfetti, setShowConfetti] = useState(true);

  const standings = useMemo(
    () =>
      [...players].sort(
        (a, b) => (game.totals[a.uid] ?? a.totalScore) - (game.totals[b.uid] ?? b.totalScore),
      ),
    [players, game.totals],
  );

  const winners = standings.filter((player) => game.winnerIds.includes(player.uid));
  const iWon = Boolean(selfUid && game.winnerIds.includes(selfUid));
  const shared = game.winnerIds.length > 1;

  useEffect(() => {
    play(iWon ? 'win' : 'roundComplete');
    const timer = setTimeout(() => setShowConfetti(false), 9000);
    return () => clearTimeout(timer);
  }, [iWon]);

  async function share(): Promise<void> {
    const text = `I just finished a game of Five Crowns — ${
      iWon ? 'and I won' : `${winners.map((w) => w.displayName).join(' & ')} won`
    } with ${game.totals[winners[0]?.uid ?? ''] ?? 0} points!`;
    if (navigator.share) {
      await navigator.share({ title: 'Five Crowns', text }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gold-400/25 bg-felt-table p-6 sm:p-10">
      {showConfetti ? <Confetti /> : null}

      <div className="relative z-10 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gold-sheen shadow-[0_0_60px_rgba(233,181,52,0.45)]"
        >
          <Trophy className="h-10 w-10 text-felt-950" aria-hidden />
        </motion.div>

        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          {iWon ? 'You win!' : shared ? 'A shared victory!' : `${winners[0]?.displayName ?? 'Nobody'} wins!`}
        </h1>
        <p className="mt-2 text-white/70">
          {shared
            ? `${winners.map((winner) => winner.displayName).join(' and ')} tied with the lowest score.`
            : `Lowest score after ${rounds.length || 11} rounds takes the crown.`}
        </p>

        <div className="mt-8 grid gap-2">
          {standings.map((player, index) => {
            const total = game.totals[player.uid] ?? player.totalScore;
            const isWinner = game.winnerIds.includes(player.uid);
            return (
              <motion.div
                key={player.uid}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 * index }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-left',
                  isWinner
                    ? 'bg-gold-400/15 ring-1 ring-gold-400/40'
                    : 'bg-black/25 ring-1 ring-white/5',
                  player.uid === selfUid && !isWinner && 'ring-white/20',
                )}
              >
                <span className="w-8 text-center font-display text-lg font-bold text-white/70">
                  {isWinner ? <Medal className="mx-auto h-5 w-5 text-gold-300" /> : ordinal(index + 1)}
                </span>
                <Avatar name={player.displayName} src={player.photoURL} size={38} ring={isWinner} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">
                    {player.displayName}
                    {player.uid === selfUid ? <span className="text-white/50"> (you)</span> : null}
                  </span>
                  <span className="block text-xs text-white/50">
                    {rounds.length} rounds played
                  </span>
                </span>
                <span className="font-display text-2xl font-bold tabular-nums text-white">
                  {total}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link
            to="/play"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gold-sheen px-4 text-sm font-semibold text-felt-950 transition hover:brightness-105"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Play again
          </Link>
          <Button variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={share}>
            Share result
          </Button>
          <Link
            to="/home"
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white/80 transition hover:bg-white/10"
          >
            <Home className="h-4 w-4" aria-hidden /> Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
