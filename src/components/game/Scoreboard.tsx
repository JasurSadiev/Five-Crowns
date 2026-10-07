import type { Game, GamePlayerPublic, RoundSummary } from '../../types/game';
import { Avatar } from '../common';
import { cn } from '../../utils/cn';

/** Running totals per round. Lowest total leads. */
export function Scoreboard({
  game,
  players,
  rounds,
  selfUid,
}: {
  game: Game;
  players: GamePlayerPublic[];
  rounds: RoundSummary[];
  selfUid: string | null;
}): JSX.Element {
  const ordered = [...players].sort(
    (a, b) => (game.totals[a.uid] ?? 0) - (game.totals[b.uid] ?? 0),
  );
  const played = rounds.filter((round) => !round.id.startsWith('tb'));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <caption className="sr-only">Scores by round. The lowest total wins.</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-faint">
            <th scope="col" className="py-2 pr-2 text-left font-medium">
              Player
            </th>
            {played.map((round) => (
              <th key={round.id} scope="col" className="px-1.5 py-2 text-center font-medium">
                R{round.roundNumber}
              </th>
            ))}
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ordered.map((player) => (
            <tr key={player.uid} className={cn(player.uid === selfUid && 'bg-gold-400/[0.06]')}>
              <th scope="row" className="py-2 pr-2 text-left font-normal">
                <span className="flex items-center gap-2">
                  <Avatar name={player.displayName} src={player.photoURL} size={24} />
                  <span className="max-w-[120px] truncate text-ink">{player.displayName}</span>
                </span>
              </th>
              {played.map((round) => {
                const entry = round.players.find((item) => item.uid === player.uid);
                return (
                  <td
                    key={round.id}
                    className={cn(
                      'px-1.5 py-2 text-center tabular-nums',
                      entry?.roundScore === 0 ? 'font-semibold text-emerald-400' : 'text-ink-muted',
                    )}
                  >
                    {entry ? entry.roundScore : '—'}
                  </td>
                );
              })}
              <td className="py-2 pl-2 text-right font-display text-base font-semibold tabular-nums text-ink">
                {game.totals[player.uid] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
