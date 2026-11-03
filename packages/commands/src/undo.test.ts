import { describe, expect, it, vi } from 'vitest';
import { createCommandRegistry } from './registry';
import { createHistory, createUndoCommands } from './undo';

function counterHistory(limit?: number) {
  const history = createHistory({ limit });
  let value = 0;
  const add = (n: number) => {
    value += n;
    history.push({ label: `Add ${n}`, undo: () => (value -= n), redo: () => (value += n) });
  };
  return { history, add, value: () => value };
}

describe('createHistory', () => {
  it('undoes and redoes in order', () => {
    const { history, add, value } = counterHistory();
    add(1);
    add(2);
    expect(value()).toBe(3);
    expect(history.undoLabel()).toBe('Add 2');

    history.undo();
    expect(value()).toBe(1);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(value()).toBe(3);
    expect(history.canRedo()).toBe(false);
  });

  it('clears the redo stack on a new action', () => {
    const { history, add } = counterHistory();
    add(1);
    history.undo();
    add(5);
    expect(history.canRedo()).toBe(false);
  });

  it('respects the limit', () => {
    const { history, add, value } = counterHistory(2);
    add(1);
    add(2);
    add(3);
    history.undo();
    history.undo();
    history.undo();
    expect(value()).toBe(1);
    expect(history.canUndo()).toBe(false);
  });

  it('is a no-op when empty and notifies on changes', () => {
    const history = createHistory();
    const listener = vi.fn();
    history.subscribe(listener);
    history.undo();
    history.redo();
    expect(listener).not.toHaveBeenCalled();
    history.push({ label: 'x', undo: () => {}, redo: () => {} });
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('createUndoCommands', () => {
  it('drives whichever stack is current', () => {
    const registry = createCommandRegistry();
    const { history, add, value } = counterHistory();
    const active: { stack?: typeof history } = {};
    registry.register(createUndoCommands(() => active.stack));

    expect(registry.isEnabled('edit.undo')).toBe(false);
    active.stack = history;
    add(4);
    expect(registry.execute('edit.undo')).toBe(true);
    expect(value()).toBe(0);
    expect(registry.execute('edit.redo')).toBe(true);
    expect(value()).toBe(4);
  });
});
