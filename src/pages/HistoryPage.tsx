import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, History, Trophy } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Panel,
  ScreenLoader,
  SectionTitle,
  Skeleton,
} from '../components/common';
import { db } from '../firebase/config';
import { watch } from '../firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime, formatDuration, ordinal } from '../utils/formatting';
import type { GameHistoryEntry } from '../types/game';
import { cn } from '../utils/cn';

export function HistoryPage(): JSX.Element {
  const { user } = useAuth();
  const [entries, setEntries] = useState<GameHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    return watch.history(user.uid, 50, setEntries);
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Game history</h1>
        <p className="mt-1 text-ink-muted">Every finished game, with the full round breakdown.</p>
      </div>

      {entries === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<History className="h-10 w-10" />}
            title="No games yet"
            description="Finish a table and it will be recorded here with every round's score."
            action={
              <Link to="/play">
                <Button>Start playing</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, index) => {
            const me = entry.players.find((player) => player.uid === user?.uid);
            const won = entry.winnerIds.includes(user?.uid ?? '');
            return (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
              >
                <Link
                  to={`/history/${entry.gameId}`}
                  className="block rounded-2xl border border-line p-4 transition hover:border-gold-400/40 hover:bg-gold-400/[0.04]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={won ? 'gold' : 'neutral'}>
                      {won ? (
                        <>
                          <Trophy className="h-3 w-3" /> {entry.isTie ? 'Shared win' : 'Win'}
                        </>
                      ) : (
                        `${ordinal(me?.rank ?? 0)} place`
                      )}
                    </Badge>
                    <span className="text-sm text-ink-muted">
                      {formatDateTime(entry.finishedAt)}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-ink-faint">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {formatDuration(entry.durationMs)}
                    </span>
                    <span className="ml-auto font-display text-2xl font-bold tabular-nums text-ink">
                      {me?.finalScore ?? '—'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.players.map((player) => (
                      <span
                        key={player.uid}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs',
                          entry.winnerIds.includes(player.uid)
                            ? 'bg-gold-400/15 text-gold-300'
                            : 'bg-ink/5 text-ink-muted dark:bg-white/5',
                        )}
                      >
                        <Avatar name={player.displayName} src={player.photoURL} size={18} />
                        {player.displayName}
                        <strong className="tabular-nums">{player.finalScore}</strong>
                      </span>
                    ))}
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function GameSummaryPage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const [entry, setEntry] = useState<GameHistoryEntry | null | undefined>(undefined);

  useEffect(() => {
    if (!gameId) return;
    void getDoc(doc(db, 'gameHistory', gameId)).then((snap) => {
      setEntry(snap.exists() ? ({ id: snap.id, ...snap.data() } as GameHistoryEntry) : null);
    });
  }, [gameId]);

  if (entry === undefined) return <ScreenLoader label="Loading the scorecard…" />;

  if (!entry) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          title="Scorecard not found"
          description="This game either never finished or you weren't part of it."
          action={
            <Link to="/history">
              <Button>Back to history</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const maxRounds = Math.max(...entry.players.map((player) => player.roundScores.length), 0);
  const ordered = [...entry.players].sort((a, b) => a.rank - b.rank);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/history"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to history
      </Link>

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">
              {entry.winnerNames.join(' & ')} {entry.isTie ? 'shared the win' : 'won'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {formatDateTime(entry.finishedAt)} · {entry.rounds} rounds ·{' '}
              {formatDuration(entry.durationMs)}
            </p>
          </div>
          <Badge tone="gold">
            <Trophy className="h-3 w-3" /> Final
          </Badge>
        </div>
      </Panel>

      <Panel className="p-0">
        <SectionTitle title="Round by round" className="p-5 pb-0" />
        <div className="overflow-x-auto p-5 pt-3">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 text-left font-medium">Player</th>
                {Array.from({ length: maxRounds }).map((_, index) => (
                  <th key={index} scope="col" className="px-1.5 py-2 text-center font-medium">
                    R{index + 1}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ordered.map((player) => (
                <tr
                  key={player.uid}
                  className={cn(player.uid === user?.uid && 'bg-gold-400/[0.07]')}
                >
                  <th scope="row" className="py-2.5 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <Avatar name={player.displayName} src={player.photoURL} size={26} />
                      <span className="truncate text-ink">{player.displayName}</span>
                      {entry.winnerIds.includes(player.uid) ? (
                        <Trophy className="h-3.5 w-3.5 text-gold-400" aria-label="Winner" />
                      ) : null}
                    </span>
                  </th>
                  {Array.from({ length: maxRounds }).map((_, index) => {
                    const score = player.roundScores[index];
                    return (
                      <td
                        key={index}
                        className={cn(
                          'px-1.5 py-2.5 text-center tabular-nums',
                          score === 0 ? 'font-semibold text-emerald-400' : 'text-ink-muted',
                        )}
                      >
                        {score ?? '—'}
                      </td>
                    );
                  })}
                  <td className="py-2.5 text-right font-display text-base font-bold tabular-nums text-ink">
                    {player.finalScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
