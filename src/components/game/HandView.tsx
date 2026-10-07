import { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownWideNarrow, Layers, MoveHorizontal } from 'lucide-react';
import type { Card, Rank } from '../../types/card';
import { PlayingCard, type CardSize } from '../cards/PlayingCard';
import { cn } from '../../utils/cn';
import type { SortMode } from '../../hooks/useGame';

function SortableCard({
  card,
  wildRank,
  size,
  selected,
  disabled,
  onClick,
  onDoubleClick,
  overlap,
  index,
}: {
  card: Card;
  wildRank: Rank;
  size: CardSize;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  overlap: number;
  index: number;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: index === 0 ? 0 : -overlap,
        zIndex: isDragging ? 50 : index,
      }}
      className={cn('relative touch-none', isDragging && 'opacity-80')}
      {...attributes}
      {...listeners}
    >
      <PlayingCard
        card={card}
        wildRank={wildRank}
        size={size}
        selected={selected}
        disabled={disabled}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        interactive
        className={cn(selected && '-translate-y-3')}
      />
    </div>
  );
}

export interface HandViewProps {
  cards: Card[];
  wildRank: Rank;
  selected: string[];
  onToggle: (cardId: string) => void;
  onDoubleClick?: (cardId: string) => void;
  onReorder: (ids: string[]) => void;
  sortMode: SortMode;
  onSortMode: (mode: SortMode) => void;
  size?: CardSize;
  disabled?: boolean;
  emptyLabel?: string;
}

/**
 * The local player's hand: overlapping fan, click to select, drag to reorder.
 * Keyboard users get the same ordering controls through dnd-kit's keyboard
 * sensor, and every card is a labelled button.
 */
export function HandView({
  cards,
  wildRank,
  selected,
  onToggle,
  onDoubleClick,
  onReorder,
  sortMode,
  onSortMode,
  size = 'md',
  disabled,
  emptyLabel = 'Your hand is empty',
}: HandViewProps): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => cards.map((card) => card.id), [cards]);

  // Keep wide hands (up to 13 cards) on screen by overlapping harder.
  const overlap = cards.length > 10 ? 26 : cards.length > 7 ? 16 : 8;

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  if (!cards.length) {
    return (
      <div className="flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-white/50">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">
          Your hand · {cards.length} cards
        </p>
        <div className="flex items-center gap-1 rounded-lg bg-black/25 p-0.5">
          {(
            [
              { id: 'rank', label: 'Rank', icon: ArrowDownWideNarrow },
              { id: 'suit', label: 'Suit', icon: Layers },
              { id: 'manual', label: 'Custom', icon: MoveHorizontal },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSortMode(option.id)}
              aria-pressed={sortMode === option.id}
              title={`Sort by ${option.label.toLowerCase()}`}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition',
                sortMode === option.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/55 hover:text-white',
              )}
            >
              <option.icon className="h-3 w-3" aria-hidden />
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div
            className="flex flex-wrap items-end justify-center gap-y-3 px-1 pb-3 pt-4 sm:flex-nowrap"
            role="group"
            aria-label="Your hand"
          >
            {cards.map((card, index) => (
              <SortableCard
                key={card.id}
                card={card}
                wildRank={wildRank}
                size={size}
                selected={selected.includes(card.id)}
                disabled={disabled}
                onClick={() => onToggle(card.id)}
                onDoubleClick={onDoubleClick ? () => onDoubleClick(card.id) : undefined}
                overlap={overlap}
                index={index}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
