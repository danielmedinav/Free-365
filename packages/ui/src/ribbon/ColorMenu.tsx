import { DropdownMenu } from 'radix-ui';
import { useCommandState, useRegistry } from '../commands/CommandProvider';
import styles from './Ribbon.module.css';
import type { IconComponent } from './types';

export type ColorSwatch = {
  /** Id of a registered command that applies this color; its label names the color. */
  command: string;
  color: string;
};

type ColorMenuProps = {
  label: string;
  icon: IconComponent;
  /** Id of the command that removes the color. */
  clearCommand: string;
  swatches: ColorSwatch[];
  /** The color at the cursor, shown as a bar under the icon. */
  current: () => string | undefined;
};

/** Swatches here are document data the user picks, so they aren't theme tokens. */
export function ColorMenu({ label, icon: Icon, clearCommand, swatches, current }: ColorMenuProps) {
  const registry = useRegistry();
  const clear = useCommandState(clearCommand);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles.colorTrigger}
        aria-label={label}
        title={label}
        disabled={!clear.enabled}
      >
        <Icon size={16} aria-hidden />
        <span className={styles.colorBar} style={{ background: current() }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* The command puts the cursor back in the document, so keep focus from returning here. */}
        <DropdownMenu.Content
          className={styles.colorMenu}
          aria-label={label}
          align="start"
          sideOffset={4}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenu.Item
            className={styles.colorClear}
            onSelect={() => registry.execute(clearCommand)}
          >
            {clear.command?.label}
          </DropdownMenu.Item>
          <div className={styles.colorGrid}>
            {swatches.map(({ command, color }) => {
              const name = registry.get(command)?.label;
              return (
                <DropdownMenu.Item
                  key={command}
                  className={styles.swatch}
                  style={{ background: color }}
                  aria-label={name}
                  title={name}
                  onSelect={() => registry.execute(command)}
                />
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
