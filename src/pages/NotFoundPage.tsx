import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';
import { PlayingCard } from '../components/cards/PlayingCard';
import { makeJoker } from '../game/cards';

export default function NotFoundPage(): JSX.Element {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-4 text-center">
      <div>
        <div className="mb-6 flex justify-center gap-2">
          <PlayingCard card={makeJoker(1, 1)} size="lg" className="-rotate-12" />
          <PlayingCard card={makeJoker(2, 2)} size="lg" className="rotate-12" />
        </div>
        <h1 className="font-display text-4xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">
          Two jokers and nothing to meld. This page doesn't exist — or the table has closed.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/home"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gold-sheen px-5 font-semibold text-felt-950 transition hover:brightness-105"
          >
            <Home className="h-4 w-4" aria-hidden /> Go home
          </Link>
          <Link
            to="/play"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-5 font-medium text-ink transition hover:bg-ink/5 dark:hover:bg-white/5"
          >
            <Search className="h-4 w-4" aria-hidden /> Find a table
          </Link>
        </div>
      </div>
    </div>
  );
}
