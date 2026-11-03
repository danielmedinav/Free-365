import { isMacPlatform, matchesShortcut, parseShortcut, type ParsedShortcut } from './shortcut';

export type Command = {
  /** Namespaced id, e.g. `file.rename`, `write.bold`. */
  id: string;
  label: string;
  description?: string;
  /** One shortcut or several alternatives; the first one is shown in the UI. */
  shortcut?: string | string[];
  /** Run the shortcut even while focus is in a text field or contenteditable. */
  allowInInputs?: boolean;
  run: () => void | Promise<unknown>;
  isEnabled?: () => boolean;
  /** For toggle commands such as Bold: whether the toggle is currently on. */
  isActive?: () => boolean;
};

export type CommandRegistry = {
  /** Registers commands; returns a function that unregisters them. */
  register(commands: Command | Command[]): () => void;
  get(id: string): Command | undefined;
  list(): Command[];
  isEnabled(id: string): boolean;
  /** Runs the command if registered and enabled. Returns whether it ran. */
  execute(id: string): boolean;
  /** Call when command state (enabled/active) may have changed so the UI re-renders. */
  notify(): void;
  subscribe(listener: () => void): () => void;
  /** Increments on every change; use as a `useSyncExternalStore` snapshot. */
  getVersion(): number;
};

export function shortcutsOf(command: Command): string[] {
  if (!command.shortcut) return [];
  return Array.isArray(command.shortcut) ? command.shortcut : [command.shortcut];
}

export function createCommandRegistry(): CommandRegistry {
  // A stack per id: the most recent registration wins, and unregistering restores the previous
  // one. This keeps React StrictMode's mount/unmount/mount and nested editors well-behaved.
  const entries = new Map<string, Command[]>();
  const listeners = new Set<() => void>();
  let version = 0;

  function notify() {
    version++;
    for (const listener of listeners) listener();
  }

  function get(id: string): Command | undefined {
    const stack = entries.get(id);
    return stack?.[stack.length - 1];
  }

  function isEnabled(id: string): boolean {
    const command = get(id);
    return !!command && (command.isEnabled?.() ?? true);
  }

  return {
    register(commands) {
      const list = Array.isArray(commands) ? commands : [commands];
      for (const command of list) {
        shortcutsOf(command).forEach(parseShortcut); // fail fast on typos
        entries.set(command.id, [...(entries.get(command.id) ?? []), command]);
      }
      notify();
      return () => {
        for (const command of list) {
          const stack = entries.get(command.id)?.filter((c) => c !== command) ?? [];
          if (stack.length) entries.set(command.id, stack);
          else entries.delete(command.id);
        }
        notify();
      };
    },
    get,
    list() {
      return [...entries.keys()].map((id) => get(id)).filter((c): c is Command => !!c);
    },
    isEnabled,
    execute(id) {
      const command = get(id);
      if (!command || !isEnabled(id)) return false;
      const result = command.run();
      if (result instanceof Promise) {
        result
          .catch((error: unknown) => console.error(`Command "${id}" failed`, error))
          .finally(notify);
      } else {
        notify();
      }
      return true;
    },
    notify,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
      target.type,
    );
  }
  return false;
}

export type BindShortcutsOptions = {
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  isMac?: boolean;
};

/** Dispatches keydown events to matching, enabled commands. Returns an unbind function. */
export function bindShortcuts(
  registry: CommandRegistry,
  { target = window, isMac = isMacPlatform() }: BindShortcutsOptions = {},
): () => void {
  const parsedCache = new Map<string, ParsedShortcut>();
  const parse = (s: string) => {
    let parsed = parsedCache.get(s);
    if (!parsed) parsedCache.set(s, (parsed = parseShortcut(s)));
    return parsed;
  };

  const onKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.defaultPrevented || event.isComposing) return;
    const inInput = isEditableTarget(event.target);
    for (const command of registry.list()) {
      if (inInput && !command.allowInInputs) continue;
      const hit = shortcutsOf(command).some((s) => matchesShortcut(event, parse(s), isMac));
      if (hit && registry.execute(command.id)) {
        event.preventDefault();
        return;
      }
    }
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
