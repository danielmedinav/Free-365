import { bindShortcuts, type Command, type CommandRegistry } from '@free360/commands';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

const RegistryContext = createContext<CommandRegistry | null>(null);

/** Provides the command registry and binds its keyboard shortcuts to the window. */
export function CommandProvider({
  registry,
  children,
}: {
  registry: CommandRegistry;
  children: ReactNode;
}) {
  useEffect(() => bindShortcuts(registry), [registry]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): CommandRegistry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useRegistry must be used inside <CommandProvider>');
  return registry;
}

/** Re-renders whenever the registry changes (registration, execution, or `notify()`). */
function useRegistryVersion(registry: CommandRegistry): number {
  return useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion);
}

export type CommandState = {
  command: Command | undefined;
  enabled: boolean;
  active: boolean | undefined;
};

export function useCommandState(id: string): CommandState {
  const registry = useRegistry();
  useRegistryVersion(registry);
  const command = registry.get(id);
  return {
    command,
    enabled: registry.isEnabled(id),
    active: command?.isActive?.(),
  };
}

/**
 * Registers commands while the calling component is mounted. The latest `commands` closures are
 * always used, so callers can pass inline objects without memoizing them.
 */
export function useRegisterCommands(commands: Command[]): void {
  const registry = useRegistry();
  const latest = useRef(commands);
  useEffect(() => {
    latest.current = commands;
  });
  const ids = commands.map((c) => c.id).join('|');

  useEffect(() => {
    const proxies: Command[] = latest.current.map((initial, index) => {
      const current = () => latest.current[index] ?? initial;
      return {
        ...initial,
        run: () => current().run(),
        isEnabled: () => current().isEnabled?.() ?? true,
        isActive: initial.isActive ? () => current().isActive?.() ?? false : undefined,
      };
    });
    return registry.register(proxies);
    // Re-register only when the set of ids changes.
  }, [registry, ids]);
}
