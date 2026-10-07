import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Crown,
  DoorOpen,
  Play,
  Search,
  Settings2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Panel,
  ScreenLoader,
  SectionTitle,
  Switch,
} from '../components/common';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useLobby } from '../hooks/useLobby';
import { useAuth } from '../hooks/useAuth';
import { useFriends } from '../hooks/useFriends';
import { useToast } from '../hooks/useToast';
import { api, type SearchedPlayer } from '../firebase/functions';
import { MIN_PLAYERS } from '../types/game';
import { cn } from '../utils/cn';

export default function LobbyPage(): JSX.Element {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { friends } = useFriends();
  const lobby = useLobby(lobbyId);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchedPlayer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);

  // Follow the host into the game the moment it starts.
  useEffect(() => {
    if (lobby.lobby?.gameId) navigate(`/game/${lobby.lobby.gameId}`, { replace: true });
  }, [lobby.lobby?.gameId, navigate]);

  // Kicked or left? Send them home rather than showing a dead screen.
  useEffect(() => {
    if (!lobby.loading && lobby.lobby && user && !lobby.lobby.playerIds.includes(user.uid)) {
      toast.info('You are no longer in this lobby');
      navigate('/play', { replace: true });
    }
  }, [lobby.loading, lobby.lobby, user, navigate, toast]);

  if (lobby.loading) return <ScreenLoader label="Opening the lobby…" />;

  if (!lobby.lobby) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={<DoorOpen className="h-10 w-10" />}
          title="This lobby is gone"
          description={lobby.error ?? 'It may have expired, been cancelled, or already started.'}
          action={<Button onClick={() => navigate('/play')}>Find another table</Button>}
        />
      </div>
    );
  }

  const data = lobby.lobby;
  const seatsLeft = data.maxPlayers - data.players.length;

  async function copyCode(): Promise<void> {
    await navigator.clipboard.writeText(data.joinCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function runSearch(): Promise<void> {
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      const result = await api.searchPlayers(search.trim());
      setResults(result.players);
    } catch (error) {
      toast.error(error, 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function invite(uid: string): Promise<void> {
    try {
      await lobby.invite(uid);
      setInvited((current) => [...current, uid]);
      toast.success('Invitation sent');
    } catch (error) {
      toast.error(error, 'Could not invite that player');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {data.hostName}'s table
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-muted">
            <Badge tone={data.settings.privacy === 'public' ? 'blue' : 'neutral'}>
              {data.settings.privacy === 'public' ? 'Public' : 'Private'}
            </Badge>
            <span>
              {data.players.length} of {data.maxPlayers} seats filled
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {lobby.isHost ? (
            <Button
              variant="secondary"
              icon={<Settings2 className="h-4 w-4" />}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </Button>
          ) : null}
          <Button
            variant="secondary"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setInviteOpen(true)}
          >
            Invite
          </Button>
          <Button
            variant="ghost"
            icon={<DoorOpen className="h-4 w-4" />}
            onClick={async () => {
              try {
                if (lobby.isHost) await lobby.cancel();
                else await lobby.leave();
                navigate('/play');
              } catch (error) {
                toast.error(error);
              }
            }}
          >
            {lobby.isHost ? 'Cancel table' : 'Leave'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* join code */}
          <Panel className="border-gold-400/25 bg-gradient-to-br from-gold-400/[0.08] to-transparent">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Join code</p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <p className="select-all font-display text-4xl font-bold tracking-[0.3em] text-gradient-gold sm:text-5xl">
                {data.joinCode}
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={copyCode}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Anyone with this code can take a seat while the table is open.
            </p>
          </Panel>

          {/* players */}
          <Panel>
            <SectionTitle
              title="Players"
              subtitle={
                seatsLeft > 0
                  ? `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} still open`
                  : 'The table is full'
              }
            />
            <ul className="space-y-2">
              {data.players.map((player) => (
                <motion.li
                  layout
                  key={player.uid}
                  className="flex items-center gap-3 rounded-xl border border-line p-3"
                >
                  <span className="w-5 text-center text-sm font-semibold text-ink-faint">
                    {player.seat + 1}
                  </span>
                  <Avatar name={player.displayName} src={player.photoURL} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-medium text-ink">
                      {player.displayName}
                      {player.uid === user?.uid ? (
                        <span className="text-xs text-ink-faint">(you)</span>
                      ) : null}
                      {player.isHost ? (
                        <Crown className="h-3.5 w-3.5 text-gold-400" aria-label="Host" />
                      ) : null}
                    </span>
                  </span>
                  {lobby.isHost && player.uid !== user?.uid ? (
                    <button
                      type="button"
                      onClick={() => void lobby.kick(player.uid).catch((error) => toast.error(error))}
                      aria-label={`Remove ${player.displayName}`}
                      className="rounded-lg p-2 text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  ) : null}
                </motion.li>
              ))}

              {Array.from({ length: Math.max(0, seatsLeft) }).map((_, index) => (
                <li
                  key={`empty-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 text-ink-faint"
                >
                  <span className="w-5 text-center text-sm font-semibold">
                    {data.players.length + index + 1}
                  </span>
                  <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-ink/5">
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="text-sm">Waiting for a player…</span>
                </li>
              ))}
            </ul>

            {lobby.isHost ? (
              <Button
                className="mt-4"
                fullWidth
                size="lg"
                variant="gold"
                icon={<Play className="h-4 w-4" />}
                disabled={!lobby.canStart}
                loading={lobby.busy}
                onClick={async () => {
                  try {
                    const gameId = await lobby.start();
                    if (gameId) navigate(`/game/${gameId}`);
                  } catch (error) {
                    toast.error(error, 'Could not start the game');
                  }
                }}
              >
                {data.players.length < MIN_PLAYERS
                  ? `Need at least ${MIN_PLAYERS} players`
                  : `Deal round 1 · ${data.players.length} players`}
              </Button>
            ) : (
              <p className="mt-4 rounded-xl bg-ink/5 p-3 text-center text-sm text-ink-muted dark:bg-white/5">
                Waiting for {data.hostName} to start the game…
              </p>
            )}
          </Panel>
        </div>

        {/* chat */}
        <Panel className="flex h-[520px] flex-col">
          <SectionTitle title="Lobby chat" />
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={lobby.chat}
              onSend={lobby.sendMessage}
              selfUid={user?.uid ?? null}
              disabled={!data.settings.enableChat}
              emptyLabel="Say hi while you wait for the others."
            />
          </div>
        </Panel>
      </div>

      {/* ----------------------------- invite modal ---------------------------- */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite players"
        description="Send a direct invitation, or just share the join code."
      >
        <div className="space-y-5">
          {friends.length ? (
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Your friends</p>
              <ul className="space-y-1.5">
                {friends.map((friend) => {
                  const seated = data.playerIds.includes(friend.uid);
                  return (
                    <li key={friend.uid} className="flex items-center gap-3">
                      <Avatar
                        name={friend.displayName}
                        src={friend.photoURL}
                        size={32}
                        presence={friend.presence}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {friend.displayName}
                      </span>
                      <Button
                        size="sm"
                        variant={seated || invited.includes(friend.uid) ? 'ghost' : 'secondary'}
                        disabled={seated || invited.includes(friend.uid)}
                        onClick={() => void invite(friend.uid)}
                      >
                        {seated ? 'At the table' : invited.includes(friend.uid) ? 'Invited' : 'Invite'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Search all players</p>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runSearch();
                }}
                placeholder="Display name"
                leading={<Search className="h-4 w-4" />}
              />
              <Button onClick={() => void runSearch()} loading={searching}>
                Search
              </Button>
            </div>

            {results !== null ? (
              results.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">No players matched that name.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {results
                    .filter((player) => player.uid !== user?.uid)
                    .map((player) => {
                      const seated = data.playerIds.includes(player.uid);
                      return (
                        <li key={player.uid} className="flex items-center gap-3">
                          <Avatar name={player.displayName} src={player.photoURL} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">
                              {player.displayName}
                            </span>
                            <span className="block text-xs text-ink-faint">
                              {player.gamesPlayed} games · {player.gamesWon} wins
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant={seated || invited.includes(player.uid) ? 'ghost' : 'secondary'}
                            disabled={seated || invited.includes(player.uid)}
                            onClick={() => void invite(player.uid)}
                          >
                            {seated ? 'Seated' : invited.includes(player.uid) ? 'Invited' : 'Invite'}
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              )
            ) : null}
          </div>
        </div>
      </Modal>

      {/* ---------------------------- settings modal --------------------------- */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Table settings"
        description="Rules, wild cards and scoring are fixed — only comfort options can change."
      >
        <div className="space-y-1">
          <Switch
            checked={data.settings.allowSpectators}
            onChange={(next) => void lobby.updateSettings({ allowSpectators: next })}
            label="Allow spectators"
            description="Watchers never see a hand."
          />
          <Switch
            checked={data.settings.enableChat}
            onChange={(next) => void lobby.updateSettings({ enableChat: next })}
            label="Table chat"
          />
          <Switch
            checked={data.settings.roundAdvance === 'auto'}
            onChange={(next) => void lobby.updateSettings({ roundAdvance: next ? 'auto' : 'host' })}
            label="Auto-advance rounds"
            description={`Starts the next round after ${data.settings.autoAdvanceSeconds}s.`}
          />
          <div className="pt-3">
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="timeout-range">
              Turn timer: {data.settings.turnTimeoutSeconds}s
            </label>
            <input
              id="timeout-range"
              type="range"
              min={30}
              max={600}
              step={30}
              value={data.settings.turnTimeoutSeconds}
              onChange={(event) =>
                void lobby.updateSettings({ turnTimeoutSeconds: Number(event.target.value) })
              }
              className={cn('w-full accent-gold-400')}
            />
            <p className="mt-1 text-xs text-ink-faint">
              When the timer runs out the server discards a card for that player.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
