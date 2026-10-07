import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Info, Lightbulb, RefreshCw, XCircle } from 'lucide-react';
import { Button, Panel, Tabs } from '../components/common';
import { PlayingCard } from '../components/cards/PlayingCard';
import { MeldDisplay } from '../components/game/MeldDisplay';
import { createDeck, shuffleDeck } from '../game/deck';
import { validateBook } from '../game/books';
import { validateRun } from '../game/runs';
import { findValidCombinations } from '../game/combinations';
import { handValue } from '../game/cards';
import { seededRandom } from '../game/rng';
import type { Rank } from '../types/card';
import { cn } from '../utils/cn';

type Lesson = 'spot' | 'score';

/**
 * A practice sandbox, clearly separated from real play.
 *
 * It runs the exact same rules engine the server uses, so anything it tells
 * you here is true at a real table. No network, no opponents, no scores saved.
 */
export default function TutorialPage(): JSX.Element {
  const [lesson, setLesson] = useState<Lesson>('spot');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  const wildRank: Rank = 5;
  const hand = useMemo(() => {
    const deck = shuffleDeck(createDeck(), seededRandom(seed));
    return deck.slice(0, 7);
  }, [seed]);

  const [selected, setSelected] = useState<string[]>([]);
  const selectedCards = hand.filter((card) => selected.includes(card.id));

  const verdict = useMemo(() => {
    if (selectedCards.length < 3) return null;
    const book = validateBook(selectedCards, wildRank);
    if (book.valid) return { valid: true as const, meld: book.meld, kind: 'book' as const };
    const run = validateRun(selectedCards, wildRank);
    if (run.valid) return { valid: true as const, meld: run.meld, kind: 'run' as const };
    return {
      valid: false as const,
      reason: run.reason ?? book.reason ?? 'Those cards do not form a book or a run.',
    };
  }, [selectedCards]);

  const analysis = useMemo(() => findValidCombinations(hand, wildRank), [hand]);

  function reset(): void {
    setSeed(Math.floor(Math.random() * 100000));
    setSelected([]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Practice sandbox
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          A private place to try out melds. This is not a real game — nothing here is saved, and
          there are no opponents.
        </p>
      </div>

      <div className="mb-5 flex justify-center">
        <Tabs
          value={lesson}
          onChange={setLesson}
          tabs={[
            { id: 'spot', label: 'Spot a meld' },
            { id: 'score', label: 'Count the damage' },
          ]}
        />
      </div>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Info className="h-4 w-4 text-sky-400" aria-hidden />
            Round 5 · fives and jokers are wild
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={reset}
          >
            Deal a new hand
          </Button>
        </div>

        <div className="mb-5 flex flex-wrap justify-center gap-1.5 rounded-2xl bg-felt-table p-4">
          {hand.map((card) => (
            <PlayingCard
              key={card.id}
              card={card}
              wildRank={wildRank}
              size="md"
              interactive
              selected={selected.includes(card.id)}
              onClick={() =>
                setSelected((current) =>
                  current.includes(card.id)
                    ? current.filter((id) => id !== card.id)
                    : [...current, card.id],
                )
              }
              className={cn(selected.includes(card.id) && '-translate-y-2')}
            />
          ))}
        </div>

        {lesson === 'spot' ? (
          <div>
            <p className="mb-3 text-sm text-ink-muted">
              Tap three or more cards to test whether they make a valid book or run.
            </p>

            {selectedCards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-faint">
                Nothing selected yet.
              </p>
            ) : verdict === null ? (
              <p className="rounded-xl bg-ink/5 p-4 text-center text-sm text-ink-muted dark:bg-white/5">
                {selectedCards.length} selected — a meld needs at least three cards.
              </p>
            ) : verdict.valid ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-emerald-500/10 p-4"
              >
                <p className="mb-3 flex items-center gap-2 font-medium text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  That's a valid {verdict.kind}!
                </p>
                {verdict.meld ? <MeldDisplay meld={verdict.meld} wildRank={wildRank} /> : null}
              </motion.div>
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-300"
              >
                <XCircle className="h-5 w-5 shrink-0" aria-hidden />
                {verdict.reason}
              </motion.p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                <Lightbulb className="h-4 w-4 text-gold-400" aria-hidden />
                The solver's best answer for this hand
              </p>
              {analysis.best.melds.length ? (
                <div className="flex flex-wrap gap-2">
                  {analysis.best.melds.map((meld, index) => (
                    <MeldDisplay key={index} meld={meld} wildRank={wildRank} size="xs" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No meld is possible in this hand — that happens, especially early on.
                </p>
              )}
              <p className="mt-2 text-sm text-ink-muted">
                Leftover penalty: <strong className="text-ink">{analysis.best.leftoverScore} points</strong>
                {analysis.canGoOut ? ' — and this hand could go out!' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-ink-muted">
              If the round ended right now and you had melded nothing, every card in your hand
              would count against you:
            </p>
            <ul className="divide-y divide-line">
              {hand.map((card) => (
                <li key={card.id} className="flex items-center gap-3 py-2">
                  <PlayingCard card={card} wildRank={wildRank} size="xs" />
                  <span className="flex-1 text-sm text-ink-muted">
                    {card.suit === 'joker'
                      ? 'Joker — always wild'
                      : card.rank === wildRank
                        ? `${card.rank} — wild this round`
                        : `Rank ${card.rank}`}
                  </span>
                  <span className="font-display text-lg font-semibold tabular-nums text-ink">
                    {handValue([card], wildRank)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-500/10 p-4">
              <span className="font-medium text-ink">Total if nothing is melded</span>
              <span className="font-display text-2xl font-bold text-rose-400">
                {handValue(hand, wildRank)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/10 p-4">
              <span className="font-medium text-ink">With the best arrangement</span>
              <span className="font-display text-2xl font-bold text-emerald-400">
                {analysis.best.leftoverScore}
              </span>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-8 text-center">
        <Link
          to="/play"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold-sheen px-6 font-semibold text-felt-950 transition hover:brightness-105"
        >
          Ready — take me to a real table
        </Link>
      </div>
    </div>
  );
}
