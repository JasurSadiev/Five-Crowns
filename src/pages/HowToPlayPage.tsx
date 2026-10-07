import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Calculator, Layers, Play, Sparkles, Target } from 'lucide-react';
import { PlayingCard } from '../components/cards/PlayingCard';
import { MeldDisplay } from '../components/game/MeldDisplay';
import { Panel, Tabs } from '../components/common';
import { makeCard, makeJoker } from '../game/cards';
import { validateBook } from '../game/books';
import { validateRun } from '../game/runs';

const bookCards = [makeCard(1, 'hearts', 9), makeCard(2, 'clubs', 9), makeCard(1, 'stars', 9)];
const bookWithWild = [makeCard(1, 'hearts', 9), makeCard(2, 'clubs', 9), makeJoker(1, 1)];
const runCards = [makeCard(1, 'spades', 5), makeCard(1, 'spades', 6), makeCard(1, 'spades', 7)];
const runWithWild = [
  makeCard(1, 'diamonds', 10),
  makeCard(2, 'diamonds', 12),
  makeCard(1, 'diamonds', 13),
];

const ROUNDS = Array.from({ length: 11 }).map((_, index) => ({
  round: index + 1,
  cards: index + 3,
  wild: index + 3,
}));

const WILD_LABELS: Record<number, string> = { 11: 'Jacks', 12: 'Queens', 13: 'Kings' };

type Section = 'basics' | 'melds' | 'turns' | 'scoring';

export default function HowToPlayPage(): JSX.Element {
  const [section, setSection] = useState<Section>('basics');

  // Build the wild-run meld through the real engine so the page can never
  // disagree with the rules that are actually enforced.
  const wildRunMeld = validateRun([...runWithWild.slice(0, 2), makeJoker(2, 1), runWithWild[2]], 3).meld;
  const bookMeld = validateBook(bookCards, 3).meld;
  const wildBookMeld = validateBook(bookWithWild, 3).meld;
  const runMeld = validateRun(runCards, 3).meld;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">How to play</h1>
        <p className="mx-auto mt-2 max-w-2xl text-ink-muted">
          Five Crowns is rummy with five suits, eleven rounds and a wild card that changes every
          hand. Games take about 30–45 minutes.
        </p>
      </div>

      <div className="mb-6 flex justify-center">
        <Tabs
          value={section}
          onChange={setSection}
          tabs={[
            { id: 'basics', label: 'The basics' },
            { id: 'melds', label: 'Books & runs' },
            { id: 'turns', label: 'Your turn' },
            { id: 'scoring', label: 'Scoring' },
          ]}
        />
      </div>

      <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {section === 'basics' ? (
          <div className="space-y-5">
            <Panel>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Layers className="h-5 w-5 text-gold-400" aria-hidden /> The deck
              </h2>
              <p className="text-ink-muted">
                Two identical 58-card decks are shuffled together — 116 cards in all. Each deck has
                five suits (stars, hearts, clubs, spades, diamonds) running 3 through King, plus
                three jokers. There are no aces and no twos.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['stars', 'hearts', 'clubs', 'spades', 'diamonds'] as const).map((suit) => (
                  <PlayingCard key={suit} card={makeCard(1, suit, 10)} wildRank={3} size="sm" />
                ))}
                <PlayingCard card={makeJoker(1, 1)} wildRank={3} size="sm" />
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Sparkles className="h-5 w-5 text-gold-400" aria-hidden /> Eleven rounds
              </h2>
              <p className="mb-4 text-ink-muted">
                In round one everyone gets three cards and all 3s are wild. Each round adds one
                card and moves the wild up by one rank, ending with thirteen cards and wild Kings.
                <strong className="text-ink"> Jokers are always wild.</strong>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-faint">
                      <th scope="col" className="py-2 text-left font-medium">Round</th>
                      <th scope="col" className="py-2 text-left font-medium">Cards dealt</th>
                      <th scope="col" className="py-2 text-left font-medium">Wild card</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ROUNDS.map((row) => (
                      <tr key={row.round}>
                        <td className="py-2 font-medium text-ink">{row.round}</td>
                        <td className="py-2 text-ink-muted">{row.cards}</td>
                        <td className="py-2 text-ink-muted">
                          {WILD_LABELS[row.wild] ?? `${row.wild}s`} + jokers
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Target className="h-5 w-5 text-gold-400" aria-hidden /> The goal
              </h2>
              <p className="text-ink-muted">
                Arrange your whole hand into books and runs, then discard your last card to{' '}
                <strong className="text-ink">go out</strong>. Everyone else gets one final turn, then
                scores whatever they still hold. After eleven rounds the{' '}
                <strong className="text-ink">lowest total wins</strong>.
              </p>
            </Panel>
          </div>
        ) : null}

        {section === 'melds' ? (
          <div className="space-y-5">
            <Panel>
              <h2 className="mb-1 font-display text-xl font-semibold text-ink">Books</h2>
              <p className="mb-4 text-ink-muted">
                Three or more cards of the <strong className="text-ink">same rank</strong>. Suits do
                not matter and duplicates are fine, since there are two decks.
              </p>
              <div className="flex flex-wrap gap-3">
                {bookMeld ? <MeldDisplay meld={bookMeld} wildRank={3} /> : null}
                {wildBookMeld ? <MeldDisplay meld={wildBookMeld} wildRank={3} /> : null}
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-1 font-display text-xl font-semibold text-ink">Runs</h2>
              <p className="mb-4 text-ink-muted">
                Three or more cards in sequence in the{' '}
                <strong className="text-ink">same suit</strong>. Runs do not wrap around — Kings are
                the top, and there is nothing below a 3.
              </p>
              <div className="flex flex-wrap gap-3">
                {runMeld ? <MeldDisplay meld={runMeld} wildRank={3} /> : null}
                {wildRunMeld ? <MeldDisplay meld={wildRunMeld} wildRank={3} /> : null}
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-1 font-display text-xl font-semibold text-ink">Wild cards</h2>
              <ul className="list-inside list-disc space-y-1.5 text-ink-muted">
                <li>Jokers are wild in every round.</li>
                <li>The card matching the round number is wild too — round 7, all 7s are wild.</li>
                <li>A wild can stand in for any card in a book or a run.</li>
                <li>
                  A wild card held in your hand at scoring is worth 20 points, a joker 50 — so they
                  are only worth keeping if you can use them.
                </li>
              </ul>
            </Panel>
          </div>
        ) : null}

        {section === 'turns' ? (
          <div className="space-y-5">
            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-ink">A turn, step by step</h2>
              <ol className="space-y-4">
                {[
                  {
                    title: 'Draw one card',
                    body: 'Take the top of the face-down stock, or the top of the discard pile if it helps you.',
                  },
                  {
                    title: 'Arrange your hand',
                    body: 'Try to fit everything into books and runs. Nothing is laid on the table yet — your hand stays secret.',
                  },
                  {
                    title: 'Discard one card',
                    body: 'Put one card face up on the discard pile. Play passes to the left.',
                  },
                  {
                    title: 'Or go out',
                    body: 'If every remaining card forms a valid meld after discarding, go out and score zero for the round.',
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-400/15 font-display font-bold text-gold-400">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{step.title}</span>
                      <span className="block text-sm text-ink-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-ink">House rules we enforce</h2>
              <ul className="list-inside list-disc space-y-1.5 text-ink-muted">
                <li>You cannot lay melds down early — everything is revealed at once when someone goes out.</li>
                <li>You cannot add cards to another player's melds.</li>
                <li>
                  Once someone goes out, every other player gets exactly one more turn to improve
                  their hand.
                </li>
                <li>
                  If a turn timer expires the server plays the lowest-value safe discard for that
                  player so the game keeps moving.
                </li>
              </ul>
            </Panel>
          </div>
        ) : null}

        {section === 'scoring' ? (
          <div className="space-y-5">
            <Panel>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Calculator className="h-5 w-5 text-gold-400" aria-hidden /> Card values
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { label: '3 through 10', value: 'Face value (3–10 points)' },
                  { label: 'Jack / Queen / King', value: '11 / 12 / 13 points' },
                  { label: 'The round’s wild rank', value: '20 points' },
                  { label: 'Joker', value: '50 points' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-xl border border-line px-4 py-3"
                  >
                    <span className="text-sm text-ink">{row.label}</span>
                    <span className="text-sm font-medium text-gold-400">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-ink-muted">
                Cards that are part of a valid book or run score{' '}
                <strong className="text-ink">zero</strong>. Only the cards you cannot use count
                against you — and the player who went out always scores zero.
              </p>
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-ink">Worked example</h2>
              <p className="mb-3 text-ink-muted">
                Round 7 (7s wild). You are left holding a King, a 4 and a joker that you could not
                fit anywhere:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <PlayingCard card={makeCard(1, 'spades', 13)} wildRank={7} size="sm" />
                <span className="text-ink-faint">13</span>
                <span className="text-ink-faint">+</span>
                <PlayingCard card={makeCard(2, 'hearts', 4)} wildRank={7} size="sm" />
                <span className="text-ink-faint">4</span>
                <span className="text-ink-faint">+</span>
                <PlayingCard card={makeJoker(1, 2)} wildRank={7} size="sm" />
                <span className="text-ink-faint">50</span>
                <span className="text-ink-faint">=</span>
                <span className="font-display text-2xl font-bold text-rose-400">67</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                That joker is expensive — which is exactly why you should use wilds rather than
                hoard them.
              </p>
            </Panel>

            <Panel>
              <h2 className="mb-3 font-display text-xl font-semibold text-ink">Winning</h2>
              <p className="text-ink-muted">
                Add up all eleven rounds. The lowest total wins. If two players tie, the table
                either shares the win or plays a six-card tie-break round — the host chooses before
                the game starts.
              </p>
            </Panel>
          </div>
        ) : null}
      </motion.div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          to="/play"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold-sheen px-6 font-semibold text-felt-950 transition hover:brightness-105"
        >
          <Play className="h-4 w-4" aria-hidden /> Start a table
        </Link>
        <Link
          to="/tutorial"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-line px-6 font-medium text-ink transition hover:bg-ink/5 dark:hover:bg-white/5"
        >
          Try the interactive tutorial
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
