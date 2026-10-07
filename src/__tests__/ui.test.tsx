import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PlayingCard, CardBack } from '../components/cards/PlayingCard';
import { HandView } from '../components/game/HandView';
import { GameTable } from '../components/game/GameTable';
import { Scoreboard } from '../components/game/Scoreboard';
import { RoundResults } from '../components/game/RoundResults';
import { FinalCelebration } from '../components/game/FinalCelebration';
import { MeldDisplay } from '../components/game/MeldDisplay';
import { EventLog } from '../components/game/EventLog';
import { makeCard, makeJoker } from '../game/cards';
import { validateBook } from '../game/books';
import { DEFAULT_GAME_SETTINGS, type Game, type GamePlayerPublic, type RoundSummary } from '../types/game';

/**
 * Smoke tests for the table rendering path.
 *
 * These exist for one reason: the game screen must never show a blank page,
 * and it must never leak another player's hand. Both are asserted here.
 */

const players: GamePlayerPublic[] = [
  {
    uid: 'me',
    displayName: 'Alex',
    photoURL: null,
    seat: 0,
    cardCount: 5,
    totalScore: 12,
    roundScore: null,
    connection: 'online',
    lastSeenAt: null,
    isHost: true,
    hasGoneOut: false,
    melds: [],
    leftover: [],
  },
  {
    uid: 'them',
    displayName: 'Maria',
    photoURL: null,
    seat: 1,
    cardCount: 5,
    totalScore: 30,
    roundScore: null,
    connection: 'online',
    lastSeenAt: null,
    isHost: false,
    hasGoneOut: false,
    melds: [],
    leftover: [],
  },
];

const game: Game = {
  id: 'g1',
  lobbyId: 'l1',
  hostId: 'me',
  status: 'playing',
  roundStatus: 'playing',
  currentRound: 3,
  wildRank: 5,
  cardsThisRound: 5,
  dealerIndex: 0,
  currentPlayerIndex: 0,
  currentPlayerId: 'me',
  turnPhase: 'draw',
  actionSeq: 4,
  turnOrder: ['me', 'them'],
  playerIds: ['me', 'them'],
  spectatorIds: [],
  settings: DEFAULT_GAME_SETTINGS,
  drawPileCount: 100,
  discardPileCount: 2,
  discardTop: { card: makeCard(1, 'hearts', 9), by: 'them' },
  wentOutBy: null,
  finalTurnsRemaining: [],
  totals: { me: 12, them: 30 },
  roundScores: null,
  winnerIds: [],
  createdAt: null,
  updatedAt: null,
  startedAt: null,
  finishedAt: null,
  turnStartedAt: null,
  turnDeadline: null,
  nextRoundAt: null,
  isTieBreakRound: false,
};

const hand = [
  makeCard(1, 'hearts', 9),
  makeCard(2, 'clubs', 9),
  makeJoker(1, 1),
  makeCard(1, 'spades', 4),
  makeCard(1, 'spades', 13),
];

describe('cards', () => {
  it('renders a face card with rank, suit glyph and a colour-independent letter', () => {
    render(<PlayingCard card={makeCard(1, 'hearts', 11)} wildRank={5} />);
    expect(screen.getAllByText('J').length).toBeGreaterThan(0);
    // H = hearts badge, so colour is never the only differentiator.
    expect(screen.getByText('H')).toBeInTheDocument();
  });

  it('marks the round wild rank visibly, not just by colour', () => {
    render(<PlayingCard card={makeCard(1, 'clubs', 5)} wildRank={5} />);
    expect(screen.getByText('Wild')).toBeInTheDocument();
  });

  it('labels a joker', () => {
    render(<PlayingCard card={makeJoker(2, 3)} wildRank={7} />);
    expect(screen.getByText('Joker')).toBeInTheDocument();
  });

  it('describes cards for screen readers when interactive', () => {
    render(<PlayingCard card={makeCard(1, 'stars', 13)} wildRank={5} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: /King of stars/i })).toBeInTheDocument();
  });

  it('renders a face-down back with no card information at all', () => {
    const { container } = render(<CardBack />);
    expect(container.textContent).not.toMatch(/[3-9]|10|J|Q|K/);
  });
});

describe('game table', () => {
  it('shows opponents without revealing any of their cards', () => {
    const { container } = render(
      <GameTable
        game={game}
        players={players}
        selfUid="me"
        secondsLeft={60}
        canDraw
        onDrawStock={() => undefined}
        onTakeDiscard={() => undefined}
        busy={false}
      />,
    );
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getAllByText(/5 cards/).length).toBeGreaterThan(0);
    // The opponent's seat must not contain any readable rank/suit information.
    const seat = screen.getByText('Maria').closest('div')?.parentElement;
    expect(seat?.querySelectorAll('[title*="of hearts"]').length ?? 0).toBe(0);
    expect(container.querySelectorAll('button[aria-label^="Draw pile"]').length).toBe(1);
  });

  it('announces the round and the wild rank', () => {
    render(
      <GameTable
        game={game}
        players={players}
        selfUid="me"
        secondsLeft={null}
        canDraw={false}
        onDrawStock={() => undefined}
        onTakeDiscard={() => undefined}
        busy={false}
      />,
    );
    expect(screen.getByText(/Round 3/)).toBeInTheDocument();
    expect(screen.getByText(/5s wild/)).toBeInTheDocument();
  });
});

describe('hand', () => {
  it('renders every held card as an accessible button', () => {
    render(
      <HandView
        cards={hand}
        wildRank={5}
        selected={[]}
        onToggle={() => undefined}
        onReorder={() => undefined}
        sortMode="rank"
        onSortMode={() => undefined}
      />,
    );
    expect(screen.getByRole('group', { name: 'Your hand' })).toBeInTheDocument();
    expect(screen.getByText(/5 cards/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Joker.*wild this round/i })).toBeInTheDocument();
  });

  it('shows an empty state rather than a blank area', () => {
    render(
      <HandView
        cards={[]}
        wildRank={5}
        selected={[]}
        onToggle={() => undefined}
        onReorder={() => undefined}
        sortMode="rank"
        onSortMode={() => undefined}
        emptyLabel="Waiting for the deal"
      />,
    );
    expect(screen.getByText('Waiting for the deal')).toBeInTheDocument();
  });
});

describe('scores and results', () => {
  const summary: RoundSummary = {
    id: 'r3',
    roundNumber: 3,
    wildRank: 5,
    cardsDealt: 5,
    dealerId: 'me',
    wentOutBy: 'me',
    players: [
      {
        uid: 'me',
        displayName: 'Alex',
        roundScore: 0,
        totalScore: 12,
        melds: [],
        leftover: [],
        wentOut: true,
      },
      {
        uid: 'them',
        displayName: 'Maria',
        roundScore: 18,
        totalScore: 30,
        melds: [],
        leftover: [makeCard(1, 'spades', 13), makeCard(1, 'spades', 5)],
        wentOut: false,
      },
    ],
    startedAt: null,
    completedAt: null,
  };

  it('ranks the lowest total first', () => {
    render(
      <Scoreboard game={game} players={players} rounds={[summary]} selfUid="me" />,
    );
    const rows = screen.getAllByRole('row');
    // header + 2 players
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Alex');
  });

  it('shows the round breakdown with a zero for the player who went out', () => {
    render(
      <RoundResults
        game={{ ...game, status: 'round_complete' }}
        summary={summary}
        selfUid="me"
        isHost
        countdown={null}
        busy={false}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getByText(/Round 3 complete/)).toBeInTheDocument();
    expect(screen.getByText('+0 this round')).toBeInTheDocument();
    expect(screen.getByText('+18 this round')).toBeInTheDocument();
  });

  it('celebrates the winner without crashing on confetti', () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
    render(
      <MemoryRouter>
        <FinalCelebration
          game={{ ...game, status: 'finished', winnerIds: ['me'], totals: { me: 42, them: 88 } }}
          players={players}
          rounds={[summary]}
          selfUid="me"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('You win!')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a meld built by the real engine', () => {
    const meld = validateBook(
      [makeCard(1, 'hearts', 9), makeCard(2, 'clubs', 9), makeJoker(1, 1)],
      5,
    ).meld;
    expect(meld).toBeTruthy();
    render(<MeldDisplay meld={meld!} wildRank={5} />);
    expect(screen.getByText(/Book of 9s/i)).toBeInTheDocument();
  });

  it('turns raw events into readable table history', () => {
    render(
      <EventLog
        events={[
          {
            id: 'e1',
            seq: 1,
            type: 'draw_stock',
            round: 3,
            actorId: 'them',
            actorName: 'Maria',
            payload: {},
            createdAt: null,
          },
          {
            id: 'e2',
            seq: 2,
            type: 'went_out',
            round: 3,
            actorId: 'me',
            actorName: 'Alex',
            payload: {},
            createdAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Maria drew from the stock')).toBeInTheDocument();
    expect(screen.getByText('Alex went out!')).toBeInTheDocument();
  });
});
