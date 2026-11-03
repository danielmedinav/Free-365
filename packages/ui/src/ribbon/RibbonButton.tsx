import { formatShortcut, shortcutsOf } from '@free360/commands';
import { Tooltip } from 'radix-ui';
import { useCommandState, useRegistry } from '../commands/CommandProvider';
import styles from './Ribbon.module.css';
import type { IconComponent } from './types';

type RibbonButtonProps = {
  command: string;
  icon: IconComponent;
  size?: 'large' | 'small';
};

export function RibbonButton({ command: id, icon: Icon, size = 'small' }: RibbonButtonProps) {
  const registry = useRegistry();
  const { command, enabled, active } = useCommandState(id);
  if (!command) return null;

  const shortcut = shortcutsOf(command)[0];
  const shortcutLabel = shortcut ? formatShortcut(shortcut) : undefined;

  return (
    <Tooltip.Root delayDuration={500}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={size === 'large' ? styles.buttonLarge : styles.button}
          disabled={!enabled}
          aria-pressed={active === undefined ? undefined : active}
          aria-keyshortcuts={shortcut?.replace(/Mod/g, 'Control')}
          data-command={id}
          onClick={() => registry.execute(id)}
        >
          <Icon size={size === 'large' ? 22 : 16} aria-hidden />
          <span className={styles.buttonLabel}>{command.label}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tooltip} sideOffset={6}>
          <strong>{command.label}</strong>
          {shortcutLabel && <kbd className={styles.kbd}>{shortcutLabel}</kbd>}
          {command.description && <p className={styles.tooltipText}>{command.description}</p>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
