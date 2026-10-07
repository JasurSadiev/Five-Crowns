import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  Camera,
  Check,
  Flame,
  Gamepad2,
  Pencil,
  Percent,
  Target,
  TrendingDown,
  Trophy,
  X,
} from 'lucide-react';
import {
  Avatar,
  Button,
  EmptyState,
  Input,
  Panel,
  ScreenLoader,
  SectionTitle,
  Stat,
} from '../components/common';
import { db } from '../firebase/config';
import { api } from '../firebase/functions';
import { uploadAvatar } from '../firebase/storage';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { validateUsername } from '../utils/validation';
import { formatDate, percent } from '../utils/formatting';
import type { UserProfile } from '../types/player';

export default function ProfilePage(): JSX.Element {
  const { uid } = useParams<{ uid?: string }>();
  const { user, profile: ownProfile } = useAuth();
  const toast = useToast();

  const isOwn = !uid || uid === user?.uid;
  const [other, setOther] = useState<UserProfile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOwn || !uid) return;
    void getDoc(doc(db, 'users', uid)).then((snap) => {
      setOther(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
    });
  }, [uid, isOwn]);

  const profile = isOwn ? ownProfile : other;

  if (profile === undefined) return <ScreenLoader label="Loading profile…" />;

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState title="Player not found" description="This profile may have been deleted." />
      </div>
    );
  }

  const played = profile.gamesPlayed ?? 0;
  const winRate = played ? (profile.gamesWon ?? 0) / played : 0;
  const avgRound = profile.roundsPlayed
    ? (profile.totalRoundScore ?? 0) / profile.roundsPlayed
    : 0;

  async function saveName(): Promise<void> {
    const error = validateUsername(name);
    if (error) {
      toast.info(error);
      return;
    }
    setSaving(true);
    try {
      await api.updateUsername(name.trim());
      toast.success('Display name updated');
      setEditing(false);
    } catch (caught) {
      toast.error(caught, 'Could not change your name');
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(file: File): Promise<void> {
    if (!user) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.info('Please choose an image under 3 MB');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      await api.updateAvatar(url);
      toast.success('Avatar updated');
    } catch (error) {
      toast.error(error, 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Panel className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-felt-600/25 to-transparent"
          />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="relative">
              <Avatar
                name={profile.displayName}
                src={profile.photoURL}
                size={88}
                presence={profile.presence}
              />
              {isOwn ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    aria-label="Change avatar"
                    className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-gold-400 text-felt-950 transition hover:brightness-105 disabled:opacity-60"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void pickAvatar(file);
                    }}
                  />
                </>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex max-w-sm items-end gap-2">
                  <Input
                    label="Display name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                  <Button size="md" loading={saving} icon={<Check className="h-4 w-4" />} onClick={saveName}>
                    Save
                  </Button>
                  <Button size="md" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setEditing(false)}>
                    <span className="sr-only">Cancel</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
                    {profile.displayName}
                  </h1>
                  {isOwn ? (
                    <button
                      type="button"
                      onClick={() => {
                        setName(profile.displayName);
                        setEditing(true);
                      }}
                      aria-label="Edit display name"
                      className="rounded-lg p-2 text-ink-faint transition hover:bg-ink/10 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}
              <p className="mt-1 text-sm text-ink-muted">
                Playing since {formatDate(profile.createdAt)} · {played} games
              </p>
            </div>
          </div>
        </Panel>
      </motion.div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Games played" value={played} icon={<Gamepad2 className="h-5 w-5" />} />
        <Stat label="Wins" value={profile.gamesWon ?? 0} icon={<Trophy className="h-5 w-5" />} tone="gold" />
        <Stat label="Win rate" value={percent(winRate)} icon={<Percent className="h-5 w-5" />} tone="green" />
        <Stat
          label="Average score"
          value={played ? (profile.averageScore ?? 0).toFixed(1) : '—'}
          hint="Lower is better"
          icon={<TrendingDown className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Panel>
          <SectionTitle title="Scoring" subtitle="Across every finished game." />
          <dl className="space-y-3">
            {[
              { label: 'Best game total', value: profile.bestScore ?? '—', hint: 'Lowest finish' },
              { label: 'Worst game total', value: profile.worstScore ?? '—' },
              { label: 'Average per round', value: played ? avgRound.toFixed(1) : '—' },
              { label: 'Rounds played', value: profile.roundsPlayed ?? 0 },
              { label: 'Rounds gone out', value: profile.roundsWon ?? 0 },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-ink-muted">
                  {row.label}
                  {row.hint ? <span className="text-ink-faint"> · {row.hint}</span> : null}
                </dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <SectionTitle title="Streaks" />
          <div className="flex items-center gap-4 rounded-xl bg-orange-500/10 p-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/20 text-orange-400">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-ink">
                {profile.currentStreak ?? 0}
              </p>
              <p className="text-sm text-ink-muted">
                Current win streak · best {profile.bestStreak ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 rounded-xl bg-emerald-500/10 p-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Target className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-ink">
                {profile.roundsPlayed
                  ? percent((profile.roundsWon ?? 0) / profile.roundsPlayed)
                  : '—'}
              </p>
              <p className="text-sm text-ink-muted">Of rounds ended by going out</p>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            All statistics are derived from archived games on the server. They cannot be set by a
            client.
          </p>
        </Panel>
      </div>
    </div>
  );
}
