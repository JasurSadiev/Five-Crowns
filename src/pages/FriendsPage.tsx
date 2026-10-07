import { useState } from 'react';
import { motion } from 'framer-motion';
import { Ban, Check, Search, UserMinus, UserPlus, UserX, Users, X } from 'lucide-react';
import {
  Avatar,
  Button,
  EmptyState,
  Input,
  Modal,
  Panel,
  SectionTitle,
  Skeleton,
  Tabs,
} from '../components/common';
import { useFriends } from '../hooks/useFriends';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api, type SearchedPlayer } from '../firebase/functions';
import { percent } from '../utils/formatting';

type Tab = 'friends' | 'requests' | 'find' | 'blocked';

export default function FriendsPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const { friends, incoming, outgoing, blocked, loading } = useFriends();
  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedPlayer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<{ uid: string; name: string } | null>(null);

  async function search(): Promise<void> {
    if (query.trim().length < 2) {
      toast.info('Type at least two characters');
      return;
    }
    setSearching(true);
    try {
      const result = await api.searchPlayers(query.trim());
      setResults(result.players.filter((player) => player.uid !== user?.uid));
    } catch (error) {
      toast.error(error, 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function addFriend(uid: string): Promise<void> {
    try {
      await api.sendFriendRequest(uid);
      setSent((current) => [...current, uid]);
      toast.success('Friend request sent');
    } catch (error) {
      toast.error(error, 'Request not sent');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Friends</h1>
        <p className="mt-1 text-ink-muted">
          Invite the people you play with most — you'll see when they're online.
        </p>
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'friends', label: 'Friends', count: friends.length },
          { id: 'requests', label: 'Requests', count: incoming.length },
          { id: 'find', label: 'Find players' },
          { id: 'blocked', label: 'Blocked', count: blocked.length },
        ]}
      />

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {tab === 'friends' ? (
          <Panel>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : friends.length === 0 ? (
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No friends yet"
                description="Search for players by their display name to send a request."
                action={<Button onClick={() => setTab('find')}>Find players</Button>}
              />
            ) : (
              <ul className="space-y-2">
                {[...friends]
                  .sort((a, b) => Number(b.presence === 'online') - Number(a.presence === 'online'))
                  .map((friend) => (
                    <li
                      key={friend.uid}
                      className="flex items-center gap-3 rounded-xl border border-line p-3"
                    >
                      <Avatar
                        name={friend.displayName}
                        src={friend.photoURL}
                        size={40}
                        presence={friend.presence}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {friend.displayName}
                        </span>
                        <span className="block text-xs capitalize text-ink-faint">
                          {friend.presence}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<UserMinus className="h-4 w-4" />}
                        onClick={() =>
                          setRemoveTarget({ uid: friend.uid, name: friend.displayName })
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        ) : null}

        {tab === 'requests' ? (
          <div className="space-y-5">
            <Panel>
              <SectionTitle title="Incoming" subtitle="People who want to play with you." />
              {incoming.length === 0 ? (
                <EmptyState title="No pending requests" />
              ) : (
                <ul className="space-y-2">
                  {incoming.map((request) => (
                    <li
                      key={request.uid}
                      className="flex items-center gap-3 rounded-xl border border-line p-3"
                    >
                      <Avatar name={request.displayName} src={request.photoURL} size={40} />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {request.displayName}
                      </span>
                      <Button
                        size="sm"
                        icon={<Check className="h-4 w-4" />}
                        onClick={() =>
                          void api
                            .respondToFriendRequest(request.pairKey, true)
                            .catch((error) => toast.error(error))
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<X className="h-4 w-4" />}
                        onClick={() =>
                          void api
                            .respondToFriendRequest(request.pairKey, false)
                            .catch((error) => toast.error(error))
                        }
                      >
                        Decline
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <SectionTitle title="Sent" subtitle="Waiting on a reply." />
              {outgoing.length === 0 ? (
                <EmptyState title="Nothing pending" />
              ) : (
                <ul className="space-y-2">
                  {outgoing.map((request) => (
                    <li key={request.uid} className="flex items-center gap-3 p-1">
                      <Avatar name={request.displayName} src={request.photoURL} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {request.displayName}
                      </span>
                      <span className="text-xs text-ink-faint">Pending</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}

        {tab === 'find' ? (
          <Panel>
            <SectionTitle title="Find players" subtitle="Search by display name." />
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search();
                }}
                placeholder="e.g. card_shark"
                leading={<Search className="h-4 w-4" />}
                aria-label="Search players"
              />
              <Button onClick={() => void search()} loading={searching}>
                Search
              </Button>
            </div>

            {results === null ? (
              <p className="mt-4 text-sm text-ink-faint">
                Searches match the start of a display name and are case-insensitive.
              </p>
            ) : results.length === 0 ? (
              <EmptyState title="No players found" description="Try a different spelling." />
            ) : (
              <ul className="mt-4 space-y-2">
                {results.map((player) => {
                  const already = friends.some((friend) => friend.uid === player.uid);
                  return (
                    <li
                      key={player.uid}
                      className="flex items-center gap-3 rounded-xl border border-line p-3"
                    >
                      <Avatar name={player.displayName} src={player.photoURL} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {player.displayName}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {player.gamesPlayed} games ·{' '}
                          {percent(player.gamesPlayed ? player.gamesWon / player.gamesPlayed : 0)}{' '}
                          win rate
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={already || sent.includes(player.uid) ? 'ghost' : 'secondary'}
                        disabled={already || sent.includes(player.uid)}
                        icon={<UserPlus className="h-4 w-4" />}
                        onClick={() => void addFriend(player.uid)}
                      >
                        {already ? 'Friends' : sent.includes(player.uid) ? 'Sent' : 'Add'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Block ${player.displayName}`}
                        icon={<Ban className="h-4 w-4" />}
                        onClick={() =>
                          void api
                            .blockPlayer(player.uid)
                            .then(() => toast.success(`${player.displayName} blocked`))
                            .catch((error) => toast.error(error))
                        }
                      >
                        <span className="sr-only">Block</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ) : null}

        {tab === 'blocked' ? (
          <Panel>
            <SectionTitle
              title="Blocked players"
              subtitle="They cannot invite you, message you or send friend requests."
            />
            {blocked.length === 0 ? (
              <EmptyState icon={<UserX className="h-8 w-8" />} title="Nobody is blocked" />
            ) : (
              <ul className="space-y-2">
                {blocked.map((player) => (
                  <li
                    key={player.uid}
                    className="flex items-center gap-3 rounded-xl border border-line p-3"
                  >
                    <Avatar name={player.displayName} src={player.photoURL} size={36} />
                    <span className="min-w-0 flex-1 truncate text-ink">{player.displayName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void api
                          .unblockPlayer(player.uid)
                          .then(() => toast.success('Unblocked'))
                          .catch((error) => toast.error(error))
                      }
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}
      </motion.div>

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? ''}?`}
        description="You can always send another request later."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!removeTarget) return;
                try {
                  await api.removeFriend(removeTarget.uid);
                  toast.success('Friend removed');
                } catch (error) {
                  toast.error(error);
                } finally {
                  setRemoveTarget(null);
                }
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
