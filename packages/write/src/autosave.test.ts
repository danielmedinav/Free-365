import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver } from './autosave';

describe('createAutosaver', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('debounces changes into one save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createAutosaver({ save, delay: 100 });

    saver.markDirty();
    await vi.advanceTimersByTimeAsync(60);
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(60);
    expect(save).not.toHaveBeenCalled();
    expect(saver.getStatus()).toBe('pending');

    await vi.advanceTimersByTimeAsync(60);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.getStatus()).toBe('saved');
  });

  it('flush saves immediately and does nothing when clean', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createAutosaver({ save, delay: 100 });

    await saver.flush();
    expect(save).not.toHaveBeenCalled();

    saver.markDirty();
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never runs two saves at once, and saves changes made during a save', async () => {
    let finish = () => {};
    const save = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const saver = createAutosaver({ save, delay: 100 });

    saver.markDirty();
    const first = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getStatus()).toBe('saving');

    saver.markDirty();
    const second = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.getStatus()).toBe('pending');

    finish();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    finish();
    await second;
    expect(saver.getStatus()).toBe('saved');
  });

  it('reports failures and retries on the next flush', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const saver = createAutosaver({ save });

    saver.markDirty();
    await saver.flush();
    expect(saver.getStatus()).toBe('error');

    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.getStatus()).toBe('saved');
    consoleError.mockRestore();
  });

  it('notifies subscribers of status changes until unsubscribed', async () => {
    const saver = createAutosaver({ save: () => Promise.resolve() });
    const listener = vi.fn();
    const unsubscribe = saver.subscribe(listener);

    saver.markDirty();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await saver.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
