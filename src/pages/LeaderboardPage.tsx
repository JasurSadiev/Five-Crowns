import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Medal, Trophy, Users } from 'lucide-react';
import {
  Avatar,
  EmptyState,
  Panel,
  SectionTitle,
  Skeleton,
  Switch,
  Tabs,
} from '../components/common';
import { api, type LeaderboardRow } from '../firebase/functions';
import { useAuth } from '../hooks/useAuth';
import { percent } from '../utils/formatting';
import { cn } from '../utils/cn';

type Scope = 'wins' | 'winRate' | 'lowestAverage' | 'gamesPlayed';

const SCOPES: Array<{ id: Scope; label: string; column: string; describe: (row: LeaderboardRow) => string }> = [
  { id: 'wins', label: 'Most wins', column: 'Wins', describe: (row) => String(row.gamesWon) },
  {
    id: 'winRate',
    label: 'Win rate',
    column: 'Win rate',
    describe: (row) => percent(row.winRate),
  },
  {
    id: 'lowestAverage',
    label: 'Lowest average',
    column: 'Avg score',
    describe: (row) => row.averageScore.toFixed(1),
  },
  {
    id: 'gamesPlayed',
    label: 'Most played',
    column: 'Games',
    describe: (row) => String(row.gamesPlayed),
  },
];

export default function LeaderboardPage(): JSX.Element {
  const { user, privacy } = useAuth();
  const [scope, setScope] = useState<Scope>('wins');
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    api
      .getLeaderboard(scope, friendsOnly)
      .then((result) => {
        if (!cancelled) setRows(result.entries);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError('The leaderboard could not be loaded. Please try again in a moment.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scope, friendsOnly]);

  const active = SCOPES.find((item) => item.id === scope) ?? SCOPES[0];
  const podium = (rows ?? []).slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Leaderboard</h1>
        <p className="mt-1 text-ink-muted">
          Ranked from verified, server-computed results. Rate boards need at least three finished
          games.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={scope}
          onChange={setScope}
          tabs={SCOPES.map((item) => ({ id: item.id, label: item.label }))}
        />
        <div className="min-w-[180px]">
          <Switch checked={friendsOnly} onChange={setFriendsOnly} label="Friends only" />
        </div>
      </div>

      {!privacy.appearOnLeaderboard ? (
        <p className="mb-4 rounded-xl border border-gold-400/25 bg-gold-400/[0.08] px-4 py-3 text-sm text-gold-200">
          You've opted out of leaderboards in your privacy settings, so you won't appear here.
        </p>
      ) : null}

      {rows === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Trophy className="h-8 w-8" />}
            title={error ? 'Could not load the leaderboard' : 'Nobody qualifies yet'}
            description={
              error ??
              (friendsOnly
                ? 'None of your friends have finished enough games.'
                : 'Finish a few games and the rankings will fill up.')
            }
          />
        </Panel>
      ) : (
        <>
          {/* podium */}
          {podium.length === 3 ? (
            <div className="mb-5 grid grid-cols-3 gap-3">
              {[podium[1], podium[0], podium[2]].map((row, index) => {
                const place = index === 1 ? 1 : index === 0 ? 2 : 3;
                return (
                  <motion.div
                    key={row.uid}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className={cn(
                      'flex flex-col items-center rounded-2xl border p-4 text-center',
                      place === 1
                        ? 'border-gold-400/40 bg-gradient-to-b from-gold-400/15 to-transparent pt-6'
                        : 'border-line',
                    )}
                  >
                    {place === 1 ? (
                      <Crown className="mb-1 h-5 w-5 text-gold-400" aria-hidden />
                    ) : (
                      <Medal className="mb-1 h-4 w-4 text-ink-faint" aria-hidden />
                    )}
                    <Avatar
                      name={row.displayName}
                      src={row.photoURL}
                      size={place === 1 ? 56 : 44}
                      ring={place === 1}
                    />
                    <p className="mt-2 w-full truncate text-sm font-medium text-ink">
                      {row.displayName}
                    </p>
                    <p className="font-display text-xl font-bold text-gradient-gold">
                      {active.describe(row)}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          ) : null}

          <Panel className="p-0">
            <SectionTitle title={active.label} className="p-5 pb-0" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="px-5 py-3 text-left font-medium">#</th>
                    <th scope="col" className="py-3 text-left font-medium">Player</th>
                    <th scope="col" className="py-3 text-right font-medium">Games</th>
                    <th scope="col" className="py-3 text-right font-medium">Wins</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      {active.column}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row, index) => (
                    <tr
                      key={row.uid}
                      className={cn(row.uid === user?.uid && 'bg-gold-400/[0.07]')}
                    >
                      <td className="px-5 py-3 font-display font-semibold text-ink-faint">
                        {index + 1}
                      </td>
                      <td className="py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={row.displayName} src={row.photoURL} size={30} />
                          <span className="truncate text-ink">
                            {row.displayName}
                            {row.uid === user?.uid ? (
                              <span className="text-ink-faint"> (you)</span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 text-right tabular-nums text-ink-muted">
                        {row.gamesPlayed}
                      </td>
                      <td className="py-3 text-right tabular-nums text-ink-muted">
                        {row.gamesWon}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                        {active.describe(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Statistics are written only by the server when a game is archived — they cannot be edited
        from a browser.
      </p>
    </div>
  );
}
