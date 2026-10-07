import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Flame,
  Gamepad2,
  History,
  Percent,
  Play,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFriends } from '../hooks/useFriends';
import { useNotifications } from '../hooks/useNotifications';
import { watch } from '../firebase/firestore';
import { api } from '../firebase/functions';
import { Avatar, Badge, Button, EmptyState, Panel, SectionTitle, Skeleton, Stat } from '../components/common';
import { formatDate, percent, relativeTime } from '../utils/formatting';
import { rankLabel } from '../game/cards';
import type { Game, GameHistoryEntry } from '../types/game';
import { useToast } from '../hooks/useToast';

export default function HomePage(): JSX.Element {
  const { user, profile, emailVerified } = useAuth();
  const { friends } = useFriends();
  const { invitations } = useNotifications();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeGames, setActiveGames] = useState<Game[] | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    const stopActive = watch.activeGames(user.uid, setActiveGames);
    const stopHistory = watch.history(user.uid, 5, setHistory);
    return () => {
      stopActive();
      stopHistory();
    };
  }, [user]);

  const winRate = profile?.gamesPlayed ? (profile.gamesWon ?? 0) / profile.gamesPlayed : 0;
  const onlineFriends = friends.filter((friend) => friend.presence === 'online');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* greeting */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Welcome back, <span className="text-gradient-gold">{profile?.displayName ?? 'player'}</span>
        </h1>
        <p className="mt-1 text-ink-muted">
          {activeGames?.length
            ? `You have ${activeGames.length} game${activeGames.length === 1 ? '' : 's'} in progress.`
            : 'No game in progress — start a table and invite someone.'}
        </p>
      </motion.div>

      {!emailVerified ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-3">
          <p className="flex-1 text-sm text-gold-200">
            Verify your email to unlock friend requests and invitations.
          </p>
          <Link
            to="/verify-email"
            className="rounded-lg bg-gold-400/20 px-3 py-1.5 text-sm font-medium text-gold-200 hover:bg-gold-400/30"
          >
            Verify now
          </Link>
        </div>
      ) : null}

      {/* invitations */}
      {invitations.length ? (
        <Panel className="mb-6 border-gold-400/30 bg-gold-400/[0.06]">
          <SectionTitle title="You've been invited" subtitle="Jump straight into a friend's table." />
          <div className="space-y-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-raised/60 p-3"
              >
                <Avatar name={invitation.senderName} src={invitation.senderPhotoURL} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    <strong>{invitation.senderName}</strong> wants you at their table
                  </p>
                  <p className="text-xs text-ink-faint">
                    Code {invitation.joinCode} · {relativeTime(invitation.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await api.respondToInvitation(invitation.id, true);
                      if (result.lobbyId) navigate(`/lobby/${result.lobbyId}`);
                    } catch (error) {
                      toast.error(error, 'Could not join that lobby');
                    }
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void api.respondToInvitation(invitation.id, false).catch(() => undefined)}
                >
                  Decline
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* resume */}
      {activeGames === null ? (
        <Skeleton className="mb-6 h-28 w-full rounded-2xl" />
      ) : activeGames.length ? (
        <Panel className="mb-6">
          <SectionTitle title="Continue playing" subtitle="Your tables are still live." />
          <div className="grid gap-3 sm:grid-cols-2">
            {activeGames.map((game) => (
              <Link
                key={game.id}
                to={`/game/${game.id}`}
                className="group flex items-center gap-3 rounded-xl border border-line p-3.5 transition hover:border-gold-400/40 hover:bg-gold-400/[0.05]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-felt-600/20 text-felt-300">
                  <Gamepad2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    Round {game.currentRound} · {rankLabel(game.wildRank)}s wild
                  </span>
                  <span className="block text-sm text-ink-muted">
                    {game.playerIds.length} players ·{' '}
                    {game.currentPlayerId === user?.uid ? (
                      <strong className="text-gold-400">your turn</strong>
                    ) : (
                      'in progress'
                    )}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-gold-400" />
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* quick actions */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link
          to="/play"
          className="group relative overflow-hidden rounded-2xl border border-gold-400/25 bg-gradient-to-br from-gold-400/15 to-transparent p-5 transition hover:border-gold-400/50"
        >
          <Play className="mb-3 h-6 w-6 text-gold-400" aria-hidden />
          <h3 className="font-display text-lg font-semibold text-ink">Start or join a table</h3>
          <p className="mt-1 text-sm text-ink-muted">Create a lobby or enter a five-character code.</p>
        </Link>
        <Link
          to="/friends"
          className="group rounded-2xl border border-line p-5 transition hover:border-felt-400/50 hover:bg-felt-500/[0.06]"
        >
          <Users className="mb-3 h-6 w-6 text-felt-400" aria-hidden />
          <h3 className="font-display text-lg font-semibold text-ink">Friends</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {onlineFriends.length ? `${onlineFriends.length} online right now` : 'Find people to play with'}
          </p>
        </Link>
        <Link
          to="/how-to-play"
          className="group rounded-2xl border border-line p-5 transition hover:border-sky-400/50 hover:bg-sky-500/[0.06]"
        >
          <BookOpen className="mb-3 h-6 w-6 text-sky-400" aria-hidden />
          <h3 className="font-display text-lg font-semibold text-ink">How to play</h3>
          <p className="mt-1 text-sm text-ink-muted">Rules, scoring and a worked example.</p>
        </Link>
      </div>

      {/* stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Games played"
          value={profile?.gamesPlayed ?? 0}
          icon={<Gamepad2 className="h-5 w-5" />}
        />
        <Stat
          label="Games won"
          value={profile?.gamesWon ?? 0}
          icon={<Trophy className="h-5 w-5" />}
          tone="gold"
        />
        <Stat
          label="Win rate"
          value={percent(winRate)}
          icon={<Percent className="h-5 w-5" />}
          tone="green"
        />
        <Stat
          label="Best score"
          value={profile?.bestScore ?? '—'}
          hint="Lower is better"
          icon={<Target className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* recent games */}
        <Panel>
          <SectionTitle
            title="Recent games"
            action={
              <Link to="/history" className="text-sm font-medium text-gold-400 hover:underline">
                View all
              </Link>
            }
          />
          {history === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="No finished games yet"
              description="Your results will appear here once a table reaches round eleven."
              action={
                <Link to="/play">
                  <Button size="sm">Start playing</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => {
                const me = entry.players.find((player) => player.uid === user?.uid);
                const won = entry.winnerIds.includes(user?.uid ?? '');
                return (
                  <li key={entry.id}>
                    <Link
                      to={`/history/${entry.gameId}`}
                      className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:bg-ink/5 dark:hover:bg-white/5"
                    >
                      <Badge tone={won ? 'gold' : 'neutral'}>{won ? 'Win' : `#${me?.rank ?? '-'}`}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          vs {entry.players.filter((p) => p.uid !== user?.uid).map((p) => p.displayName).join(', ')}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {formatDate(entry.finishedAt)} · {entry.rounds} rounds
                        </span>
                      </span>
                      <span className="font-display text-lg font-semibold tabular-nums text-ink">
                        {me?.finalScore ?? '—'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* friends */}
        <Panel>
          <SectionTitle
            title="Friends online"
            action={
              <Link to="/friends" className="text-sm font-medium text-gold-400 hover:underline">
                Manage
              </Link>
            }
          />
          {friends.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-8 w-8" />}
              title="No friends yet"
              description="Search for players by name and send a request."
              action={
                <Link to="/friends">
                  <Button size="sm" variant="secondary">
                    Find players
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {[...friends]
                .sort((a, b) => Number(b.presence === 'online') - Number(a.presence === 'online'))
                .slice(0, 6)
                .map((friend) => (
                  <li key={friend.uid} className="flex items-center gap-3">
                    <Avatar
                      name={friend.displayName}
                      src={friend.photoURL}
                      size={34}
                      presence={friend.presence}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {friend.displayName}
                    </span>
                    <span className="text-xs capitalize text-ink-faint">{friend.presence}</span>
                  </li>
                ))}
            </ul>
          )}

          {profile?.currentStreak ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500/10 p-3 text-sm text-orange-300">
              <Flame className="h-4 w-4" aria-hidden />
              {profile.currentStreak} win streak — best is {profile.bestStreak}.
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
