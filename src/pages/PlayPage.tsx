import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Globe, Lock, Plus, RefreshCw, Ticket, Users } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  SectionTitle,
  Select,
  Skeleton,
  Switch,
} from '../components/common';
import { api, type PublicLobby } from '../firebase/functions';
import { useToast } from '../hooks/useToast';
import { normaliseJoinCode, validateJoinCode } from '../utils/validation';
import { errorMessage } from '../utils/errors';
import { DEFAULT_GAME_SETTINGS } from '../types/game';
import { cn } from '../utils/cn';

export default function PlayPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [creating, setCreating] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private');
  const [allowSpectators, setAllowSpectators] = useState(false);
  const [enableChat, setEnableChat] = useState(true);
  const [turnTimeout, setTurnTimeout] = useState(120);
  const [roundAdvance, setRoundAdvance] = useState<'host' | 'auto'>('host');
  const [tieBreak, setTieBreak] = useState<'shared_win' | 'tie_break_round'>('shared_win');

  const [publicLobbies, setPublicLobbies] = useState<PublicLobby[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadPublic(): Promise<void> {
    setRefreshing(true);
    try {
      const result = await api.listPublicLobbies();
      setPublicLobbies(result.lobbies);
    } catch {
      setPublicLobbies([]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPublic();
  }, []);

  async function join(event: FormEvent): Promise<void> {
    event.preventDefault();
    const normalised = normaliseJoinCode(code);
    const error = validateJoinCode(normalised);
    if (error) return setCodeError(error);
    setCodeError(null);
    setJoining(true);
    try {
      const result = await api.joinLobbyByCode(normalised);
      navigate(`/lobby/${result.lobbyId}`);
    } catch (caught) {
      setCodeError(errorMessage(caught));
    } finally {
      setJoining(false);
    }
  }

  async function create(): Promise<void> {
    setCreating(true);
    try {
      const result = await api.createLobby({
        maxPlayers,
        settings: {
          ...DEFAULT_GAME_SETTINGS,
          privacy,
          maxPlayers,
          allowSpectators,
          enableChat,
          turnTimeoutSeconds: turnTimeout,
          roundAdvance,
          tieBreak,
        },
      });
      navigate(`/lobby/${result.lobbyId}`);
    } catch (caught) {
      toast.error(caught, 'Could not create the table');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Play Five Crowns</h1>
        <p className="mt-1 text-ink-muted">Create a table for your group, or join one with a code.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------ join ------------------------------ */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Panel className="h-full">
            <SectionTitle
              title="Join with a code"
              subtitle="Five characters, not case sensitive."
            />
            <form onSubmit={join} className="space-y-4">
              <Input
                value={code}
                onChange={(event) => {
                  setCode(normaliseJoinCode(event.target.value));
                  setCodeError(null);
                }}
                placeholder="ABC45"
                maxLength={5}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Join code"
                leading={<Ticket className="h-4 w-4" />}
                error={codeError}
                className="text-center font-display text-2xl font-bold uppercase tracking-[0.4em]"
              />
              <Button type="submit" fullWidth size="lg" loading={joining} disabled={code.length !== 5}>
                Join table
              </Button>
              <p className="text-center text-xs text-ink-faint">
                Codes never contain 0, O, 1, I or L — no more squinting.
              </p>
            </form>
          </Panel>
        </motion.div>

        {/* ----------------------------- create ----------------------------- */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Panel className="h-full">
            <SectionTitle title="Create a table" subtitle="You'll be the host." />

            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">Maximum players</span>
                <div className="flex flex-wrap gap-1.5">
                  {[2, 3, 4, 5, 6, 7].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setMaxPlayers(count)}
                      aria-pressed={maxPlayers === count}
                      className={cn(
                        'h-10 w-10 rounded-xl text-sm font-semibold transition',
                        maxPlayers === count
                          ? 'bg-felt-500 text-white'
                          : 'border border-line text-ink-muted hover:border-ink-faint',
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">Visibility</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'private', label: 'Private', icon: Lock, hint: 'Code or invite only' },
                      { id: 'public', label: 'Public', icon: Globe, hint: 'Listed for anyone' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPrivacy(option.id)}
                      aria-pressed={privacy === option.id}
                      className={cn(
                        'rounded-xl border p-3 text-left transition',
                        privacy === option.id
                          ? 'border-gold-400/60 bg-gold-400/10'
                          : 'border-line hover:border-ink-faint',
                      )}
                    >
                      <option.icon className="mb-1.5 h-4 w-4 text-ink-muted" aria-hidden />
                      <span className="block text-sm font-medium text-ink">{option.label}</span>
                      <span className="block text-xs text-ink-faint">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Turn timer"
                  value={turnTimeout}
                  onChange={(event) => setTurnTimeout(Number(event.target.value))}
                >
                  <option value={60}>60 seconds</option>
                  <option value={120}>2 minutes (default)</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                </Select>
                <Select
                  label="Between rounds"
                  value={roundAdvance}
                  onChange={(event) => setRoundAdvance(event.target.value as 'host' | 'auto')}
                >
                  <option value="host">Host continues</option>
                  <option value="auto">Auto-advance</option>
                </Select>
              </div>

              <Select
                label="If scores tie at the end"
                value={tieBreak}
                hint="Official rules allow either. This cannot be changed once the game starts."
                onChange={(event) => setTieBreak(event.target.value as 'shared_win' | 'tie_break_round')}
              >
                <option value="shared_win">Share the win</option>
                <option value="tie_break_round">Play a 6-card tie-break round</option>
              </Select>

              <div className="divide-y divide-line border-y border-line">
                <Switch
                  checked={allowSpectators}
                  onChange={setAllowSpectators}
                  label="Allow spectators"
                  description="Watchers never see anyone's hand."
                />
                <Switch
                  checked={enableChat}
                  onChange={setEnableChat}
                  label="Enable table chat"
                  description="Rate-limited to keep things civil."
                />
              </div>

              <Button
                fullWidth
                size="lg"
                variant="gold"
                loading={creating}
                onClick={create}
                icon={<Plus className="h-4 w-4" />}
              >
                Create table
              </Button>
            </div>
          </Panel>
        </motion.div>
      </div>

      {/* --------------------------- public lobbies --------------------------- */}
      <Panel className="mt-6">
        <SectionTitle
          title="Open tables"
          subtitle="Public lobbies waiting for players."
          action={
            <Button
              size="sm"
              variant="ghost"
              loading={refreshing}
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void loadPublic()}
            >
              Refresh
            </Button>
          }
        />

        {publicLobbies === null ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : publicLobbies.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No public tables right now"
            description="Create one and it will show up here for other players."
          />
        ) : (
          <ul className="space-y-2">
            {publicLobbies.map((lobby) => (
              <li
                key={lobby.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-felt-600/20 font-display font-bold text-felt-300">
                  {lobby.players}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{lobby.hostName}'s table</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                    {lobby.players}/{lobby.maxPlayers} players · code {lobby.joinCode}
                    {lobby.allowSpectators ? (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> spectators welcome
                      </span>
                    ) : null}
                  </span>
                </span>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await api.joinLobby(lobby.id);
                      navigate(`/lobby/${result.lobbyId}`);
                    } catch (error) {
                      toast.error(error, 'Could not join');
                    }
                  }}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
