import { useEffect, useRef } from 'react';
import { ScrollText } from 'lucide-react';
import type { GameEvent } from '../../types/game';
import { shortCard } from '../../game/cards';
import { formatTime } from '../../utils/formatting';
import type { Card } from '../../types/card';

function describe(event: GameEvent): string {
  const actor = event.actorName ?? 'Someone';
  const card = event.payload?.card as Card | undefined;
  switch (event.type) {
    case 'game_started':
      return 'The game begins. Good luck!';
    case 'round_started':
      return `Round ${event.round} dealt · ${String(event.payload?.cardsDealt ?? '')} cards, ${String(
        event.payload?.wildLabel ?? '',
      )}s wild`;
    case 'draw_stock':
      return `${actor} drew from the stock`;
    case 'draw_discard':
      return card ? `${actor} took ${shortCard(card)} from the discard` : `${actor} took the discard`;
    case 'discard':
      return event.payload?.timeout
        ? `${actor} ran out of time — ${card ? shortCard(card) : 'a card'} auto-discarded`
        : `${actor} discarded ${card ? shortCard(card) : 'a card'}`;
    case 'went_out':
      return `${actor} went out!`;
    case 'final_turn':
      return `${actor} takes their final turn`;
    case 'turn_timeout':
      return `${actor} timed out`;
    case 'round_complete':
      return `Round ${event.round} complete`;
    case 'game_complete':
      return 'Game over';
    case 'player_joined':
      return `${actor} joined`;
    case 'player_left':
      return `${actor} left the table`;
    case 'player_disconnected':
      return `${actor} lost connection`;
    case 'player_reconnected':
      return `${actor} reconnected`;
    default:
      return `${actor} acted`;
  }
}

export function EventLog({ events }: { events: GameEvent[] }): JSX.Element {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        <ScrollText className="h-3.5 w-3.5" aria-hidden /> Table log
      </div>
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">Nothing has happened yet.</p>
      ) : (
        <ol
          ref={ref}
          className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm"
          aria-live="polite"
          aria-label="Game events"
        >
          {events.map((event) => (
            <li key={event.id} className="flex gap-2 text-ink-muted">
              <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
                {formatTime(event.createdAt)}
              </span>
              <span className="min-w-0 flex-1">{describe(event)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
