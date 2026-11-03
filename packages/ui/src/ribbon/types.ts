import type { ComponentType, ReactNode } from 'react';

export type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

export type RibbonItem =
  | {
      type: 'command';
      /** Id of a registered command; label, shortcut, and state come from the registry. */
      command: string;
      icon: IconComponent;
      size?: 'large' | 'small';
    }
  | {
      type: 'custom';
      id: string;
      render: () => ReactNode;
    };

export type RibbonGroup = {
  id: string;
  label: string;
  items: RibbonItem[];
};

export type RibbonTab = {
  id: string;
  label: string;
  groups: RibbonGroup[];
};
