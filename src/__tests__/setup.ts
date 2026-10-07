import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no matchMedia, no AudioContext and no IntersectionObserver.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
/* test shims for APIs jsdom does not provide */
(window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
(window as unknown as Record<string, unknown>).IntersectionObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
};

// jsdom declares these but throws "not implemented" when they are called.
Element.prototype.scrollTo = () => {};
window.scrollTo = () => {};
