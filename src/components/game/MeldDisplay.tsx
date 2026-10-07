import type { Card, Meld, Rank } from '../../types/card';
import { PlayingCard, type CardSize } from '../cards/PlayingCard';
import { SUIT_LABEL, rankPlural } from '../../game/cards';
import { cn } from '../../utils/cn';

export function MeldDisplay({
  meld,
  wildRank,
  size = 'sm',
  showLabel = true,
}: {
  meld: Meld;
  wildRank: Rank;
  size?: CardSize;
  showLabel?: boolean;
}): JSX.Element {
  const label =
    meld.type === 'book'
      ? `Book of ${meld.rank ? rankPlural(meld.rank) : 'wilds'}`
      : `Run in ${meld.suit ? SUIT_LABEL[meld.suit] : 'wilds'}`;
  return (
    <div className="rounded-xl bg-black/20 p-2 ring-1 ring-white/10">
      {showLabel ? (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-300/90">
          {label}
        </p>
      ) : null}
      <div className="flex">
        {meld.cards.map((card, index) => (
          <PlayingCard
            key={card.id}
            card={card}
            wildRank={wildRank}
            size={size}
            className={index === 0 ? '' : '-ml-3'}
          />
        ))}
      </div>
    </div>
  );
}

export function LeftoverDisplay({
  cards,
  wildRank,
  size = 'sm',
}: {
  cards: Card[];
  wildRank: Rank;
  size?: CardSize;
}): JSX.Element | null {
  if (!cards.length) return null;
  return (
    <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/20">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-300/90">
        Unmelded
      </p>
      <div className="flex">
        {cards.map((card, index) => (
          <PlayingCard
            key={card.id}
            card={card}
            wildRank={wildRank}
            size={size}
            className={cn(index === 0 ? '' : '-ml-3')}
          />
        ))}
      </div>
    </div>
  );
}
