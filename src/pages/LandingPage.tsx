import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Clock,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
} from 'lucide-react';
import { PlayingCard } from '../components/cards/PlayingCard';
import { makeCard, makeJoker } from '../game/cards';
import { useAuth } from '../hooks/useAuth';

const HERO_CARDS = [
  makeCard(1, 'hearts', 7),
  makeCard(1, 'stars', 7),
  makeJoker(1, 1),
  makeCard(2, 'diamonds', 7),
  makeCard(1, 'clubs', 7),
];

const FEATURES = [
  {
    icon: Wifi,
    title: 'Genuinely real-time',
    body: 'Every draw, discard and score streams to all seats instantly. Open two browsers and watch the same table move together.',
  },
  {
    icon: ShieldCheck,
    title: 'Server-authoritative',
    body: 'The deck, turn order and every score live on the server. A tampered client is simply rejected — nobody can peek or cheat.',
  },
  {
    icon: Users,
    title: '2 to 7 players',
    body: 'Share a five-character code or invite friends directly. Spectators can watch without ever seeing a hand.',
  },
  {
    icon: Clock,
    title: 'Reconnect anywhere',
    body: 'Close the tab, switch devices, come back. Your hand is waiting and a turn timer keeps the game flowing.',
  },
  {
    icon: Layers,
    title: 'All eleven rounds',
    body: 'Three cards up to thirteen, with the round number always wild. Books, runs, wild substitutions — the full rule set.',
  },
  {
    icon: Sparkles,
    title: 'Built to feel good',
    body: 'A dark felt table, smooth animations, sound, keyboard support and a reduce-motion switch for when you need calm.',
  },
];

export default function LandingPage(): JSX.Element {
  const { user } = useAuth();

  return (
    <div>
      {/* ---------------------------------- hero --------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(21,121,90,0.28),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[120px]"
        />

        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:pt-24">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-4 py-1.5 text-xs font-medium text-gold-300"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Real multiplayer · no bots, no fake tables
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-6xl"
          >
            The classic rummy game of
            <br />
            <span className="text-gradient-gold">five suits and eleven rounds</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted"
          >
            Gather two to seven friends around a shared table. Each round the wild card changes and
            the hands grow. Lay everything down, go out first, and finish with the lowest score.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to={user ? '/play' : '/register'}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold-sheen px-6 font-semibold text-felt-950 shadow-[0_12px_30px_-12px_rgba(233,181,52,0.9)] transition hover:brightness-105 active:scale-[0.98]"
            >
              {user ? 'Play now' : 'Create free account'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/how-to-play"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line px-6 font-medium text-ink transition hover:bg-ink/5 dark:hover:bg-white/5"
            >
              <BookOpen className="h-4 w-4" aria-hidden />
              Learn the rules
            </Link>
          </motion.div>

          {/* fanned hero cards */}
          <div className="mt-14 flex items-end justify-center" aria-hidden>
            {HERO_CARDS.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 40, rotate: 0 }}
                animate={{
                  opacity: 1,
                  y: Math.abs(index - 2) * 10,
                  rotate: (index - 2) * 9,
                }}
                transition={{ delay: 0.25 + index * 0.07, type: 'spring', stiffness: 220, damping: 20 }}
                whileHover={{ y: -12 }}
                className="-mx-3 sm:-mx-2"
                style={{ zIndex: index === 2 ? 10 : 5 - Math.abs(index - 2) }}
              >
                <PlayingCard card={card} wildRank={7} size="lg" />
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-faint">
            Round seven: every 7 is wild, and jokers always are.
          </p>
        </div>
      </section>

      {/* -------------------------------- features ------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: index * 0.05 }}
              className="panel p-5"
            >
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-felt-500/15 text-felt-400">
                <feature.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="font-display text-base font-semibold text-ink">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{feature.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* --------------------------------- steps -------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="panel overflow-hidden p-0">
          <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { step: '01', title: 'Create a table', body: 'Pick your settings and get a five-character join code.' },
              { step: '02', title: 'Invite your people', body: 'Share the code or send an invitation to a friend.' },
              { step: '03', title: 'Deal and play', body: 'Eleven rounds, lowest total wins the crown.' },
            ].map((item) => (
              <div key={item.step} className="p-6">
                <span className="font-display text-sm font-bold text-gold-400">{item.step}</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to={user ? '/play' : '/register'}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-felt-500 px-6 font-semibold text-white transition hover:bg-felt-400"
          >
            Start a table
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
