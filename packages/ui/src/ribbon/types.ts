import type { ComponentType, ReactNode } from 'react';

export type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

export type RibbonItem =
  | {
      type: 'command';
      /** Id of a registered command; label, shortcut, and state come from the registry. */
      command: string;
      icon: IconComponent;
      /** `icon` hides the label; it still names the button for screen readers and in the tooltip. */
      size?: 'large' | 'small' | 'icon';
    }
  | {
      type: 'custom';
      id: string;
      render: () => ReactNode;
    };

export type RibbonGroup = {
  id: string;
  label: string;
  /** Fixes the group's width in pixels so its items wrap onto two rows. */
  width?: number;
  items: RibbonItem[];
};

export type RibbonTab = {
  id: string;
  label: string;
  groups: RibbonGroup[];
};
