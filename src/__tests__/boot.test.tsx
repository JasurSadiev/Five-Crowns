/**
 * Regression tests for the boot overlay.
 *
 * Context: a full-screen `#boot` spinner lived in index.html and nothing ever
 * removed it, so the deployed site showed a loading screen forever while the
 * app rendered invisibly underneath. Neither curl (status codes only) nor the
 * component tests (they render into their own container) could see it, because
 * neither one ever composed the real index.html with a real mount.
 *
 * These tests do exactly that: they load index.html from disk, mount the app
 * through src/main.tsx, and assert the overlay is gone.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';

const projectRoot = resolve(__dirname, '../..');
const indexHtml = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');

function bodyOf(html: string): string {
  return html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
}

function headStyleOf(html: string): string {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
}

describe('index.html boot overlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('ships a pure-CSS safety net that hides the overlay once #root has content', () => {
    const css = headStyleOf(indexHtml).replace(/\s+/g, ' ');
    // Must not depend on JavaScript: if a script fails the overlay still goes.
    expect(css).toContain('#root:not(:empty) + #boot');
    expect(css).toMatch(/#root:not\(:empty\) \+ #boot \{ display: none !important; \}/);
  });

  it('keeps #boot as the immediate next sibling of #root (the CSS rule requires it)', () => {
    document.body.innerHTML = bodyOf(indexHtml);
    const root = document.getElementById('root');
    const boot = document.getElementById('boot');
    expect(root).not.toBeNull();
    expect(boot).not.toBeNull();
    // An adjacent-sibling combinator breaks the moment anything is inserted between them.
    expect(root?.nextElementSibling).toBe(boot);
  });

  it('removes the overlay and fills #root when the real entrypoint runs', async () => {
    document.head.innerHTML = `<style>${headStyleOf(indexHtml)}</style>`;
    document.body.innerHTML = bodyOf(indexHtml);

    expect(document.getElementById('boot')).not.toBeNull();
    expect(document.getElementById('root')?.childElementCount).toBe(0);

    // Executing the genuine entrypoint, not a stand-in.
    await import('../main');

    await waitFor(() => {
      expect(document.getElementById('root')?.childElementCount).toBeGreaterThan(0);
    });

    // The app rendered AND the overlay is gone - the exact pair of conditions
    // the shipped bug violated.
    expect(document.getElementById('boot')).toBeNull();
  });
});
