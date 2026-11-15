import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isSubmitShortcut, useSubmitShortcut } from './useSubmitShortcut';

function Harness({ onSubmit, enabled = true }: { onSubmit: () => unknown; enabled?: boolean }) {
  useSubmitShortcut(onSubmit, enabled);
  return <input data-testid="field" />;
}

describe('useSubmitShortcut', () => {
  it('matches only Ctrl/Cmd+Enter', () => {
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isSubmitShortcut({ key: 'a', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
  });

  it('submits on Ctrl+Enter from an input and ignores plain Enter', () => {
    const onSubmit = vi.fn();
    const { getByTestId } = render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(getByTestId('field'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(getByTestId('field'), { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(getByTestId('field'), { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled and removes the listener on unmount', () => {
    const onSubmit = vi.fn();
    const { rerender, unmount } = render(<Harness onSubmit={onSubmit} enabled={false} />);
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<Harness onSubmit={onSubmit} enabled />);
    unmount();
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores the shortcut while an async submission is running', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve(); await Promise.resolve();
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
