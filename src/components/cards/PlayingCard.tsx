import { forwardRef, memo } from 'react';
import { motion } from 'framer-motion';
import type { Card, CardSuit, Rank } from '../../types/card';
import { SUIT_LETTER, SUIT_SYMBOL, describeCard, isWild, rankLabel } from '../../game/cards';
import { cn } from '../../utils/cn';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

export const CARD_WIDTH: Record<CardSize, number> = { xs: 34, sm: 52, md: 72, lg: 96 };
const RATIO = 1.42;

const SUIT_TEXT: Record<CardSuit, string> = {
  stars: 'text-suit-stars',
  hearts: 'text-suit-hearts',
  clubs: 'text-suit-clubs',
  spades: 'text-suit-spades',
  diamonds: 'text-suit-diamonds',
  joker: 'text-suit-joker',
};

const SUIT_BG: Record<CardSuit, string> = {
  stars: 'bg-suit-stars',
  hearts: 'bg-suit-hearts',
  clubs: 'bg-suit-clubs',
  spades: 'bg-suit-spades',
  diamonds: 'bg-suit-diamonds',
  joker: 'bg-suit-joker',
};

export interface PlayingCardProps {
  card: Card;
  wildRank?: Rank;
  size?: CardSize;
  selected?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  /** Rendered as a button with a full screen-reader description. */
  interactive?: boolean;
  style?: React.CSSProperties;
  tabIndex?: number;
}

/**
 * A single Five Crowns card.
 *
 * Readability rules that matter for accessibility:
 *  - the rank is printed in both top corners at a large size
 *  - the suit is shown as a glyph AND a letter (T/H/C/S/D), so colour is never
 *    the only way to tell two suits apart
 *  - wild cards carry a visible "WILD" ribbon rather than just a colour change
 */
export const PlayingCard = memo(
  forwardRef<HTMLDivElement, PlayingCardProps>(function PlayingCard(
    {
      card,
      wildRank,
      size = 'md',
      selected,
      disabled,
      highlighted,
      dimmed,
      onClick,
      onDoubleClick,
      className,
      interactive = Boolean(onClick),
      style,
      tabIndex,
    },
    ref,
  ) {
    const width = CARD_WIDTH[size];
    const height = Math.round(width * RATIO);
    const joker = card.suit === 'joker';
    const wild = wildRank !== undefined && isWild(card, wildRank);
    const label = rankLabel(card.rank);
    const symbol = SUIT_SYMBOL[card.suit];
    const letter = SUIT_LETTER[card.suit];

    const description = `${describeCard(card)}${wild ? ', wild this round' : ''}${
      selected ? ', selected' : ''
    }`;

    const Tag = interactive ? motion.button : motion.div;

    return (
      <Tag
        ref={ref as never}
        type={interactive ? 'button' : undefined}
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={interactive ? disabled : undefined}
        aria-label={interactive ? description : undefined}
        aria-pressed={interactive ? Boolean(selected) : undefined}
        title={description}
        tabIndex={tabIndex}
        style={{ width, height, ...style }}
        layout
        whileHover={interactive && !disabled ? { y: -6 } : undefined}
        whileTap={interactive && !disabled ? { scale: 0.97 } : undefined}
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className={cn(
          'relative shrink-0 select-none overflow-hidden rounded-card border bg-white text-left shadow-card',
          'border-slate-300/80 font-card',
          interactive && !disabled && 'cursor-pointer hover:shadow-card-hover',
          selected && 'ring-2 ring-gold-400 ring-offset-2 ring-offset-felt-800',
          highlighted && 'ring-2 ring-emerald-400',
          dimmed && 'opacity-45 saturate-50',
          disabled && 'cursor-not-allowed',
          className,
        )}
      >
        {joker ? (
          <JokerFace width={width} />
        ) : (
          <>
            {/* top-left index */}
            <span
              className={cn('absolute left-[7%] top-[3%] flex flex-col items-center leading-none', SUIT_TEXT[card.suit])}
            >
              <span style={{ fontSize: width * 0.3 }} className="font-bold tracking-tighter">
                {label}
              </span>
              <span style={{ fontSize: width * 0.24 }} aria-hidden>
                {symbol}
              </span>
            </span>

            {/* centre glyph */}
            <span
              aria-hidden
              className={cn(
                'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-90',
                SUIT_TEXT[card.suit],
              )}
              style={{ fontSize: width * 0.56, lineHeight: 1 }}
            >
              {symbol}
            </span>

            {/* bottom-right index (rotated, like a real card) */}
            <span
              className={cn(
                'absolute bottom-[3%] right-[7%] flex rotate-180 flex-col items-center leading-none',
                SUIT_TEXT[card.suit],
              )}
            >
              <span style={{ fontSize: width * 0.3 }} className="font-bold tracking-tighter">
                {label}
              </span>
              <span style={{ fontSize: width * 0.24 }} aria-hidden>
                {symbol}
              </span>
            </span>

            {/* colour-independent suit letter */}
            {size !== 'xs' ? (
              <span
                className={cn(
                  'absolute right-[6%] top-[5%] grid place-items-center rounded-[4px] text-white',
                  SUIT_BG[card.suit],
                )}
                style={{ width: width * 0.22, height: width * 0.22, fontSize: width * 0.14 }}
                aria-hidden
              >
                {letter}
              </span>
            ) : null}
          </>
        )}

        {wild ? (
          <span
            className="absolute inset-x-0 bottom-0 bg-gold-sheen text-center font-bold uppercase tracking-[0.18em] text-felt-950"
            style={{ fontSize: Math.max(6, width * 0.13), paddingBlock: width * 0.03 }}
          >
            Wild
          </span>
        ) : null}
      </Tag>
    );
  }),
);

function JokerFace({ width }: { width: number }): JSX.Element {
  return (
    <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-100 via-white to-amber-100">
      <span className="text-center leading-none">
        <span style={{ fontSize: width * 0.46 }} aria-hidden>
          🃏
        </span>
        <span
          className="mt-1 block font-bold uppercase tracking-[0.2em] text-suit-joker"
          style={{ fontSize: Math.max(6, width * 0.12) }}
        >
          Joker
        </span>
      </span>
    </span>
  );
}

/** Face-down card used for opponents, the stock and dealing animations. */
export function CardBack({
  size = 'md',
  className,
  style,
}: {
  size?: CardSize;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const width = CARD_WIDTH[size];
  const height = Math.round(width * RATIO);
  return (
    <div
      aria-hidden
      style={{ width, height, ...style }}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-card border border-felt-950/60 shadow-card',
        'bg-[linear-gradient(135deg,#0f6049_0%,#0a3b2e_45%,#082d24_100%)]',
        className,
      )}
    >
      <div
        className="absolute inset-[7%] rounded-card border border-gold-400/35"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(233,181,52,0.10) 0 4px, transparent 4px 8px)',
        }}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold-300/80"
        style={{ fontSize: width * 0.4 }}
      >
        ♛
      </span>
    </div>
  );
}

/** Compact stack indicator, e.g. the draw pile. */
export function CardPile({
  count,
  size = 'md',
  label,
  onClick,
  disabled,
  className,
}: {
  count: number;
  size?: CardSize;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  const depth = Math.min(3, Math.max(0, Math.ceil(count / 18)));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={`${label}: ${count} cards`}
      className={cn(
        'group relative block tap-highlight-none transition',
        onClick && !disabled && 'cursor-pointer hover:-translate-y-1',
        disabled && 'cursor-default',
        className,
      )}
      style={{ width: CARD_WIDTH[size], height: Math.round(CARD_WIDTH[size] * RATIO) + depth * 3 }}
    >
      {Array.from({ length: depth }).map((_, index) => (
        <CardBack
          key={index}
          size={size}
          className="absolute left-0"
          style={{ top: (depth - index) * 3, opacity: 0.55 + index * 0.15 }}
        />
      ))}
      <CardBack
        size={size}
        className={cn(
          'absolute left-0 top-0 transition',
          onClick && !disabled && 'group-hover:shadow-card-hover group-hover:ring-2 group-hover:ring-gold-400',
        )}
      />
      {count === 0 ? (
        <span className="absolute inset-0 grid place-items-center rounded-card bg-felt-950/70 text-[10px] uppercase tracking-wider text-white/70">
          Empty
        </span>
      ) : null}
    </button>
  );
}

/** Dashed outline used where a pile is empty. */
export function CardSlot({
  size = 'md',
  label,
  className,
}: {
  size?: CardSize;
  label: string;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-card border-2 border-dashed border-white/20 text-[10px] uppercase tracking-wider text-white/40',
        className,
      )}
      style={{ width: CARD_WIDTH[size], height: Math.round(CARD_WIDTH[size] * RATIO) }}
    >
      {label}
    </div>
  );
}
