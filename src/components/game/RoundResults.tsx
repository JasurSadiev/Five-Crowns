import { motion } from 'framer-motion';
import { ArrowRight, Crown, Timer } from 'lucide-react';
import type { Game, RoundSummary } from '../../types/game';
import { Avatar, Badge, Button } from '../common';
import { MeldDisplay, LeftoverDisplay } from './MeldDisplay';
import { rankLabel } from '../../game/cards';
import { cn } from '../../utils/cn';

interface RoundResultsProps {
  game: Game;
  summary: RoundSummary | null;
  selfUid: string | null;
  isHost: boolean;
  countdown: number | null;
  busy: boolean;
  onContinue: () => void;
}

/**
 * Shown between rounds: what everyone laid down, what it cost them, and the
 * running totals. Lowest total is winning, so the table is sorted ascending.
 */
export function RoundResults({
  game,
  summary,
  selfUid,
  isHost,
  countdown,
  busy,
  onContinue,
}: RoundResultsProps): JSX.Element {
  const rows = summary
    ? [...summary.players].sort((a, b) => a.totalScore - b.totalScore)
    : Object.entries(game.totals)
        .map(([uid, total]) => ({
          uid,
          displayName: uid,
          roundScore: game.roundScores?.[uid] ?? 0,
          totalScore: total,
          melds: [],
          leftover: [],
          wentOut: game.wentOutBy === uid,
        }))
        .sort((a, b) => a.totalScore - b.totalScore);

  const isLastRound = game.currentRound >= 11 && !game.isTieBreakRound;
  const autoAdvance = game.settings.roundAdvance === 'auto';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden p-0"
    >
      <div className="border-b border-line bg-gradient-to-r from-felt-800/40 to-transparent px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Round {summary?.roundNumber ?? game.currentRound} complete
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {summary ? `${summary.cardsDealt} cards · ` : ''}
              {rankLabel(summary?.wildRank ?? game.wildRank)}s were wild
              {summary?.wentOutBy ? (
                <>
                  {' · '}
                  <span className="text-emerald-400">
                    {summary.players.find((player) => player.uid === summary.wentOutBy)
                      ?.displayName ?? 'A player'}{' '}
                    went out
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {autoAdvance && countdown !== null && countdown > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Timer className="h-4 w-4" aria-hidden /> Next round in {countdown}s
              </span>
            ) : null}
            {isHost || autoAdvance ? (
              <Button
                onClick={onContinue}
                loading={busy}
                icon={<ArrowRight className="h-4 w-4" />}
                variant="gold"
              >
                {isLastRound ? 'See final results' : 'Next round'}
              </Button>
            ) : (
              <span className="text-sm text-ink-muted">Waiting for the host to continue…</span>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-line">
        {rows.map((row, index) => (
          <div
            key={row.uid}
            className={cn(
              'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start',
              row.uid === selfUid && 'bg-gold-400/[0.06]',
            )}
          >
            <div className="flex min-w-[220px] items-center gap-3">
              <span className="w-6 text-center font-display text-lg font-semibold text-ink-faint">
                {index + 1}
              </span>
              <Avatar name={row.displayName} size={36} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                  {row.displayName}
                  {row.wentOut ? <Crown className="h-4 w-4 text-gold-400" aria-label="Went out" /> : null}
                </p>
                <p className="text-sm text-ink-muted">
                  <span className={cn(row.roundScore === 0 && 'text-emerald-400')}>
                    +{row.roundScore} this round
                  </span>
                  {' · '}
                  <strong className="text-ink">{row.totalScore} total</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-start gap-2">
              {row.melds.map((meld, meldIndex) => (
                <MeldDisplay
                  key={meldIndex}
                  meld={meld}
                  wildRank={summary?.wildRank ?? game.wildRank}
                  size="xs"
                  showLabel={false}
                />
              ))}
              <LeftoverDisplay
                cards={row.leftover}
                wildRank={summary?.wildRank ?? game.wildRank}
                size="xs"
              />
              {!row.melds.length && !row.leftover.length ? (
                <Badge tone={row.roundScore === 0 ? 'green' : 'neutral'}>
                  {row.roundScore === 0 ? 'Went out — zero' : 'No melds'}
                </Badge>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
