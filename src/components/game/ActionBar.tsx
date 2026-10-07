import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Hand,
  Lightbulb,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { Card, Meld, Rank } from '../../types/card';
import type { CombinationAnalysis } from '../../game/combinations';
import { Button, Modal } from '../common';
import { MeldDisplay } from './MeldDisplay';
import { PlayingCard } from '../cards/PlayingCard';
import { describeCard } from '../../game/cards';
import { cn } from '../../utils/cn';

interface ActionBarProps {
  wildRank: Rank;
  isMyTurn: boolean;
  phase: 'draw' | 'discard';
  selected: string[];
  hand: Card[];
  analysis: CombinationAnalysis | null;
  busy: boolean;
  confirmDiscard: boolean;
  onDiscard: (cardId: string) => void;
  onGoOut: (cardId: string, melds: Meld[]) => void;
  onClearSelection: () => void;
  waitingFor: string | null;
}

/**
 * The turn controls.
 *
 * "Go out" is only offered when the deterministic solver proves the hand can
 * be fully melded after one discard. The server re-verifies the arrangement,
 * so this is purely a guard-rail against impossible clicks.
 */
export function ActionBar({
  wildRank,
  isMyTurn,
  phase,
  selected,
  hand,
  analysis,
  busy,
  confirmDiscard,
  onDiscard,
  onGoOut,
  onClearSelection,
  waitingFor,
}: ActionBarProps): JSX.Element {
  const [goOutOpen, setGoOutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [optionIndex, setOptionIndex] = useState(0);

  const selectedCard = selected.length === 1 ? hand.find((card) => card.id === selected[0]) : undefined;
  const canAct = isMyTurn && phase === 'discard' && !busy;
  const canGoOut = Boolean(analysis?.canGoOut) && canAct;

  const goOutOptions = analysis?.goOutOptions ?? [];
  const chosen = goOutOptions[Math.min(optionIndex, Math.max(0, goOutOptions.length - 1))];

  const penalty = analysis?.bestAfterDiscard?.arrangement.leftoverScore ?? null;

  const discardLabel = useMemo(() => {
    if (!selectedCard) return 'Select a card to discard';
    return `Discard ${describeCard(selectedCard)}`;
  }, [selectedCard]);

  function doDiscard(): void {
    if (!selectedCard) return;
    if (confirmDiscard) {
      setConfirmOpen(true);
      return;
    }
    onDiscard(selectedCard.id);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isMyTurn ? (
          <>
            {phase === 'draw' ? (
              <p className="flex items-center gap-2 rounded-xl bg-gold-400/15 px-3.5 py-2.5 text-sm font-medium text-gold-100">
                <Hand className="h-4 w-4" aria-hidden />
                Draw from the stock or take the discard
              </p>
            ) : (
              <>
                <Button
                  onClick={doDiscard}
                  disabled={!selectedCard || busy}
                  loading={busy && !goOutOpen}
                  icon={<Trash2 className="h-4 w-4" />}
                  variant="primary"
                >
                  <span className="hidden sm:inline">{discardLabel}</span>
                  <span className="sm:hidden">Discard</span>
                </Button>

                {canGoOut ? (
                  <Button
                    variant="gold"
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => {
                      // Prefer the option that discards the card they picked.
                      const preferred = selectedCard
                        ? goOutOptions.findIndex((option) => option.discard.id === selectedCard.id)
                        : -1;
                      setOptionIndex(preferred >= 0 ? preferred : 0);
                      setGoOutOpen(true);
                    }}
                  >
                    Go out!
                  </Button>
                ) : null}
              </>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-black/25 px-3.5 py-2.5 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {waitingFor ? `Waiting for ${waitingFor}` : 'Waiting for the next turn'}
          </p>
        )}

        <div className="ml-auto flex items-center gap-2">
          {penalty !== null && !analysis?.canGoOut ? (
            <span className="hidden rounded-lg bg-black/25 px-2.5 py-1.5 text-xs text-white/60 sm:inline">
              Best case if the round ends now:{' '}
              <strong className="text-white/85">{penalty} pts</strong>
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon={<Lightbulb className="h-4 w-4" />}
            onClick={() => setHintOpen(true)}
            className="text-white/70 hover:text-white"
          >
            Hints
          </Button>
          {selected.length ? (
            <Button variant="ghost" size="sm" onClick={onClearSelection} className="text-white/70">
              Clear ({selected.length})
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---- Go out confirmation ---- */}
      <Modal
        open={goOutOpen}
        onClose={() => setGoOutOpen(false)}
        title="Go out this round"
        description="Lay down every card, discard one, and end the round. Everyone else gets one last turn."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGoOutOpen(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              loading={busy}
              icon={<Check className="h-4 w-4" />}
              onClick={() => {
                if (!chosen) return;
                onGoOut(chosen.discard.id, chosen.melds);
                setGoOutOpen(false);
              }}
            >
              Go out
            </Button>
          </>
        }
      >
        {chosen ? (
          <div className="space-y-4">
            {goOutOptions.length > 1 ? (
              <div>
                <p className="mb-2 text-sm text-ink-muted">
                  {goOutOptions.length} ways to go out — pick the card to discard:
                </p>
                <div className="flex flex-wrap gap-2">
                  {goOutOptions.map((option, index) => (
                    <button
                      key={option.discard.id}
                      type="button"
                      onClick={() => setOptionIndex(index)}
                      className={cn(
                        'rounded-xl p-1 transition',
                        index === optionIndex
                          ? 'bg-gold-400/20 ring-2 ring-gold-400'
                          : 'ring-1 ring-line hover:bg-ink/5',
                      )}
                      aria-pressed={index === optionIndex}
                    >
                      <PlayingCard card={option.discard} wildRank={wildRank} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Your melds</p>
              <div className="flex flex-wrap gap-2">
                {chosen.melds.map((meld, index) => (
                  <MeldDisplay key={index} meld={meld} wildRank={wildRank} size="sm" />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Discarding</p>
              <PlayingCard card={chosen.discard} wildRank={wildRank} size="sm" />
            </div>

            <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
              You score 0 this round. Everyone else gets one final turn before scoring.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* ---- Optional discard confirmation ---- */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Discard this card?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                if (selectedCard) onDiscard(selectedCard.id);
                setConfirmOpen(false);
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        {selectedCard ? (
          <div className="flex items-center gap-4">
            <PlayingCard card={selectedCard} wildRank={wildRank} size="md" />
            <p className="text-sm text-ink-muted">
              {describeCard(selectedCard)} goes face-up on the discard pile where the next player
              can take it.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* ---- Hints ---- */}
      <Modal
        open={hintOpen}
        onClose={() => setHintOpen(false)}
        title="What could you make?"
        description="Calculated from your own hand only — no hidden information is used."
        size="lg"
      >
        <AnimatePresence>
          {analysis ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="rounded-xl bg-ink/5 p-3 text-sm">
                {analysis.canGoOut ? (
                  <p className="flex items-center gap-2 font-medium text-emerald-400">
                    <Sparkles className="h-4 w-4" /> You can go out right now.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-ink-muted">
                    <TriangleAlert className="h-4 w-4 text-amber-400" />
                    Best arrangement leaves{' '}
                    <strong className="text-ink">
                      {analysis.bestAfterDiscard?.arrangement.leftoverScore ??
                        analysis.best.leftoverScore}{' '}
                      points
                    </strong>{' '}
                    on the table.
                  </p>
                )}
              </div>

              {analysis.best.melds.length ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Melds you already hold</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.best.melds.map((meld, index) => (
                      <MeldDisplay key={index} meld={meld} wildRank={wildRank} size="xs" />
                    ))}
                  </div>
                </div>
              ) : null}

              {analysis.nearMisses.length ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">One card away</p>
                  <ul className="space-y-1.5 text-sm text-ink-muted">
                    {analysis.nearMisses.slice(0, 6).map((miss, index) => (
                      <li key={index}>
                        {miss.cards.map((card) => describeCard(card)).join(' + ')} — needs{' '}
                        <strong className="text-ink">{miss.needs}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </motion.div>
          ) : (
            <p className="text-sm text-ink-muted">Nothing to analyse yet.</p>
          )}
        </AnimatePresence>
      </Modal>
    </>
  );
}
