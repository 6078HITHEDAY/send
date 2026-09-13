/**
 * Bun test preload that installs a happy-dom Window so
 * `@testing-library/react` can mount components.
 */
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });

Object.defineProperties(globalThis, {
  window: { value: window, configurable: true },
  document: { value: window.document, configurable: true },
  navigator: { value: window.navigator, configurable: true },
  HTMLElement: { value: window.HTMLElement, configurable: true },
  HTMLInputElement: { value: window.HTMLInputElement, configurable: true },
  HTMLButtonElement: { value: window.HTMLButtonElement, configurable: true },
  customElements: { value: window.customElements, configurable: true },
  getComputedStyle: { value: window.getComputedStyle.bind(window), configurable: true },
  requestAnimationFrame: {
    value: window.requestAnimationFrame.bind(window),
    configurable: true
  },
  cancelAnimationFrame: {
    value: window.cancelAnimationFrame.bind(window),
    configurable: true
  },
  MutationObserver: { value: window.MutationObserver, configurable: true }
});
