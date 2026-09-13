import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { Notice } from '../../src/client/components/Notice.tsx';

afterEach(() => {
  cleanup();
});

describe('Notice', () => {
  test('renders nothing when html is empty', () => {
    const { container } = render(<Notice html="" />);
    expect(container.innerHTML).toBe('');
  });

  test('renders operator-supplied HTML', () => {
    render(<Notice html="<strong>hello</strong>" />);
    expect(screen.getByText('hello').tagName).toBe('STRONG');
  });
});
