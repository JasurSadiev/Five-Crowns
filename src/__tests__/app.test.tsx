import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

/**
 * Boots the entire application exactly as main.tsx does.
 *
 * This is the guard against the worst failure mode of a Firebase SPA: all the
 * providers wire up, the router resolves and the landing page paints, rather
 * than the user getting a blank white screen.
 */
describe('application boot', () => {
  it('renders the landing page with working navigation', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('heading', { name: /rummy game of/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create free account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn the rules/i })).toBeInTheDocument();
    // A skip link is present for keyboard users.
    expect(screen.getByRole('link', { name: /Skip to content/i })).toBeInTheDocument();
  });
});
