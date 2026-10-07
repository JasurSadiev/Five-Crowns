import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accessibility,
  Bell,
  Eye,
  Monitor,
  Moon,
  Palette,
  ShieldAlert,
  Sun,
  Volume2,
} from 'lucide-react';
import { Button, Input, Modal, Panel, SectionTitle, Select, Switch } from '../components/common';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { deleteAccount } from '../firebase/auth';
import { requestNotificationPermission, notificationPermission } from '../utils/notifications';
import { play } from '../utils/sound';
import { cn } from '../utils/cn';

export default function SettingsPage(): JSX.Element {
  const { user, settings, privacy, updateSettings, updatePrivacy } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const usesPassword = user?.providerData.some((p) => p.providerId === 'password') ?? false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-ink-muted">
          Preferences are saved to your account and follow you to any device.
        </p>
      </div>

      <div className="space-y-6">
        {/* ------------------------------ appearance ----------------------------- */}
        <Panel>
          <SectionTitle
            title="Appearance"
            subtitle="The table looks best in dark, but it's your call."
          />
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Monitor },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                aria-pressed={theme === option.id}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition',
                  theme === option.id
                    ? 'border-gold-400/60 bg-gold-400/10 text-ink'
                    : 'border-line text-ink-muted hover:border-ink-faint',
                )}
              >
                <option.icon className="h-5 w-5" aria-hidden />
                {option.label}
              </button>
            ))}
          </div>

          <div className="divide-y divide-line">
            <Switch
              checked={settings.animations}
              onChange={(next) => void updateSettings({ animations: next })}
              label="Animations"
              description="Card movement, transitions and celebrations."
            />
            <Switch
              checked={settings.largeCards}
              onChange={(next) => void updateSettings({ largeCards: next })}
              label="Larger cards"
              description="Easier to read on big screens or from across the room."
            />
            <Switch
              checked={settings.autoSortCards}
              onChange={(next) => void updateSettings({ autoSortCards: next })}
              label="Auto-sort new hands"
              description="Sort by rank when a round is dealt. You can always rearrange."
            />
          </div>
        </Panel>

        {/* --------------------------- accessibility ---------------------------- */}
        <Panel>
          <SectionTitle
            title="Accessibility"
            subtitle="Five Crowns never relies on colour alone — every suit also shows a glyph and a letter."
          />
          <div className="divide-y divide-line">
            <Switch
              checked={settings.reduceMotion}
              onChange={(next) => void updateSettings({ reduceMotion: next })}
              label="Reduce motion"
              description="Removes non-essential animation. Also honours your system setting."
            />
            <Switch
              checked={settings.highContrast}
              onChange={(next) => void updateSettings({ highContrast: next })}
              label="High contrast"
              description="Stronger borders and text contrast throughout."
            />
            <Switch
              checked={settings.confirmDiscard}
              onChange={(next) => void updateSettings({ confirmDiscard: next })}
              label="Confirm before discarding"
              description="A safety net against misclicks."
            />
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-ink/5 p-3 text-xs text-ink-muted dark:bg-white/5">
            <Accessibility className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Every control is reachable with Tab, the table announces turns to screen readers, and
            the hand supports keyboard drag with the arrow keys.
          </p>
        </Panel>

        {/* -------------------------------- audio ------------------------------- */}
        <Panel>
          <SectionTitle title="Sound" />
          <div className="divide-y divide-line">
            <Switch
              checked={settings.soundEffects}
              onChange={(next) => {
                void updateSettings({ soundEffects: next });
                if (next) play('select');
              }}
              label="Sound effects"
              description="Short cues for draws, discards and your turn."
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            icon={<Volume2 className="h-4 w-4" />}
            onClick={() => play('turn')}
          >
            Play a test sound
          </Button>
        </Panel>

        {/* ---------------------------- notifications --------------------------- */}
        <Panel>
          <SectionTitle title="Notifications" />
          <div className="divide-y divide-line">
            <Switch
              checked={settings.browserNotifications}
              onChange={async (next) => {
                if (next) {
                  const granted = await requestNotificationPermission();
                  if (!granted) {
                    toast.info(
                      'Browser notifications are blocked',
                      'Enable them for this site in your browser settings.',
                    );
                    return;
                  }
                }
                void updateSettings({ browserNotifications: next });
              }}
              label="Browser notifications"
              description="Only when the tab is in the background, for your turn and invitations."
            />
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
            <Bell className="h-3.5 w-3.5" aria-hidden />
            Permission status: {notificationPermission()}
          </p>
        </Panel>

        {/* ------------------------------- privacy ------------------------------ */}
        <Panel>
          <SectionTitle title="Privacy" />
          <div className="divide-y divide-line">
            <Switch
              checked={privacy.showOnlineStatus}
              onChange={(next) => void updatePrivacy({ showOnlineStatus: next })}
              label="Show when I'm online"
              description="Friends see a green dot next to your name."
            />
            <Switch
              checked={privacy.appearOnLeaderboard}
              onChange={(next) => void updatePrivacy({ appearOnLeaderboard: next })}
              label="Appear on leaderboards"
            />
            <Switch
              checked={privacy.allowFriendRequests}
              onChange={(next) => void updatePrivacy({ allowFriendRequests: next })}
              label="Allow friend requests"
            />
          </div>
          <div className="mt-4">
            <Select
              label="Who can invite me to games"
              value={privacy.allowGameInvitations}
              onChange={(event) =>
                void updatePrivacy({
                  allowGameInvitations: event.target.value as 'everyone' | 'friends' | 'nobody',
                })
              }
            >
              <option value="everyone">Everyone</option>
              <option value="friends">Friends only</option>
              <option value="nobody">Nobody</option>
            </Select>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Your email address is never shown to other players, and nobody — including other
            players at your table — can read your hand.
          </p>
        </Panel>

        {/* ------------------------------- account ------------------------------ */}
        <Panel className="border-rose-500/25">
          <SectionTitle
            title="Danger zone"
            subtitle="Deleting your account removes your profile, statistics and friendships."
          />
          <Button
            variant="danger"
            icon={<ShieldAlert className="h-4 w-4" />}
            onClick={() => setDeleteOpen(true)}
          >
            Delete my account
          </Button>
        </Panel>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description="This cannot be undone. Games you played stay in other players' history, but your profile and statistics are removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={confirmText !== 'DELETE'}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteAccount(usesPassword ? password : undefined);
                  toast.success('Your account has been deleted');
                  navigate('/');
                } catch (error) {
                  toast.error(error, 'Could not delete the account');
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Permanently delete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {usesPassword ? (
            <Input
              label="Confirm your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          ) : (
            <p className="text-sm text-ink-muted">
              You'll be asked to sign in with Google again to confirm.
            </p>
          )}
          <Input
            label="Type DELETE to confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value.toUpperCase())}
            placeholder="DELETE"
          />
        </div>
      </Modal>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-faint">
        <Palette className="h-3.5 w-3.5" aria-hidden />
        Game rules, wild cards and scoring are fixed by the server and cannot be changed by any
        player.
      </p>
    </div>
  );
}
