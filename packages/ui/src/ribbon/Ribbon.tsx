import { Tabs, Tooltip } from 'radix-ui';
import { useState } from 'react';
import styles from './Ribbon.module.css';
import { RibbonButton } from './RibbonButton';
import type { RibbonTab } from './types';

type RibbonProps = {
  tabs: RibbonTab[];
  /** Tab selected on first render; defaults to the second tab (the first is usually File). */
  defaultTab?: string;
};

export function Ribbon({ tabs, defaultTab }: RibbonProps) {
  const [value, setValue] = useState(defaultTab ?? tabs[1]?.id ?? tabs[0]?.id ?? '');
  const selected = tabs.some((t) => t.id === value) ? value : (tabs[0]?.id ?? '');

  return (
    <Tooltip.Provider>
      <Tabs.Root className={styles.ribbon} value={selected} onValueChange={setValue}>
        <Tabs.List className={styles.tabList} aria-label="Ribbon">
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id} className={styles.tab}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Content key={tab.id} value={tab.id} className={styles.panel}>
            {tab.groups.map((group) => (
              <div key={group.id} role="group" aria-label={group.label} className={styles.group}>
                <div className={styles.groupItems}>
                  {group.items.map((item) =>
                    item.type === 'command' ? (
                      <RibbonButton
                        key={item.command}
                        command={item.command}
                        icon={item.icon}
                        size={item.size}
                      />
                    ) : (
                      <div key={item.id}>{item.render()}</div>
                    ),
                  )}
                </div>
                <div className={styles.groupLabel} aria-hidden>
                  {group.label}
                </div>
              </div>
            ))}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Tooltip.Provider>
  );
}
