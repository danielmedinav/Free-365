import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './Controls.module.css';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'separator' };

type MenuProps = {
  /** The trigger element; must forward refs (e.g. `IconButton`, `Button`). */
  trigger: ReactNode;
  items: MenuEntry[];
  align?: 'start' | 'end';
};

export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align={align} sideOffset={4}>
          {items.map((item, index) =>
            item.type === 'separator' ? (
              <DropdownMenu.Separator key={`sep-${index}`} className={styles.menuSeparator} />
            ) : (
              <DropdownMenu.Item
                key={item.label}
                className={[styles.menuItem, item.danger ? styles.menuItemDanger : '']
                  .filter(Boolean)
                  .join(' ')}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                {item.icon}
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
