import { describe, expect, it, vi } from 'vitest';
import { bindShortcuts, createCommandRegistry } from './registry';

describe('command registry', () => {
  it('registers, executes, and unregisters commands', () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    const unregister = registry.register({ id: 'file.save', label: 'Save', run });

    expect(registry.execute('file.save')).toBe(true);
    expect(run).toHaveBeenCalledOnce();

    unregister();
    expect(registry.get('file.save')).toBeUndefined();
    expect(registry.execute('file.save')).toBe(false);
  });

  it('does not run disabled commands', () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register({ id: 'x', label: 'X', run, isEnabled: () => false });
    expect(registry.isEnabled('x')).toBe(false);
    expect(registry.execute('x')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('lets a later registration override and restores the earlier one', () => {
    const registry = createCommandRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.register({ id: 'edit.undo', label: 'Undo', run: first });
    const unregister = registry.register({ id: 'edit.undo', label: 'Undo', run: second });

    registry.execute('edit.undo');
    expect(second).toHaveBeenCalledOnce();

    unregister();
    registry.execute('edit.undo');
    expect(first).toHaveBeenCalledOnce();
    expect(registry.list()).toHaveLength(1);
  });

  it('notifies subscribers and bumps the version', () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const before = registry.getVersion();
    registry.register({ id: 'a', label: 'A', run: () => {} });
    registry.execute('a');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.getVersion()).toBe(before + 2);
  });

  it('rejects invalid shortcuts at registration time', () => {
    const registry = createCommandRegistry();
    expect(() =>
      registry.register({ id: 'a', label: 'A', shortcut: 'Mod+', run: () => {} }),
    ).toThrow();
  });
});

describe('bindShortcuts', () => {
  function setup(allowInInputs = false) {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register({ id: 'doc.new', label: 'New', shortcut: 'Alt+N', run, allowInInputs });
    const unbind = bindShortcuts(registry, { isMac: false });
    return { run, unbind };
  }

  it('runs the matching command and prevents the default action', () => {
    const { run, unbind } = setup();
    const event = new KeyboardEvent('keydown', { key: 'n', altKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(run).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    unbind();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', altKey: true }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('ignores shortcuts typed in text fields unless allowed', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const fire = () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', altKey: true, bubbles: true }));

    const blocked = setup(false);
    fire();
    expect(blocked.run).not.toHaveBeenCalled();
    blocked.unbind();

    const allowed = setup(true);
    fire();
    expect(allowed.run).toHaveBeenCalledOnce();
    allowed.unbind();
    input.remove();
  });
});
