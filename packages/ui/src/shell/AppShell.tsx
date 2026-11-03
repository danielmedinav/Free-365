import { APPS, type DocKind } from '@free360/core';
import type { ReactNode } from 'react';
import { Ribbon } from '../ribbon/Ribbon';
import type { RibbonTab } from '../ribbon/types';
import { AppIcon } from './AppIcon';
import styles from './AppShell.module.css';
import { Logo } from './Logo';
import { StatusBar } from './StatusBar';
import { ThemeToggle } from './ThemeToggle';
import { TitleInput } from './TitleInput';

export type AppShellProps = {
  /** Which app is showing; omit on the home screen. */
  app?: DocKind;
  title?: string;
  onTitleChange?: (title: string) => void;
  onHome?: () => void;
  ribbon?: RibbonTab[];
  /** Extra controls in the top bar, before the theme toggle. */
  actions?: ReactNode;
  status?: { left?: ReactNode; right?: ReactNode };
  children: ReactNode;
};

export function AppShell({
  app,
  title,
  onTitleChange,
  onHome,
  ribbon,
  actions,
  status,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell} data-app={app}>
      <a href="#fs-main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.brand}
          onClick={onHome}
          disabled={!onHome}
          aria-label={onHome ? 'Free 360 home' : undefined}
        >
          <Logo />
          <span>Free 360</span>
        </button>
        {app && (
          <span className={styles.appName}>
            <AppIcon kind={app} size={14} />
            {APPS[app].name}
          </span>
        )}
        {title !== undefined &&
          (onTitleChange ? (
            <TitleInput value={title} onCommit={onTitleChange} />
          ) : (
            <h1 className={styles.titleText}>{title}</h1>
          ))}
        <div className={styles.spacer} />
        {actions}
        <ThemeToggle />
      </header>
      {ribbon && ribbon.length > 0 && <Ribbon tabs={ribbon} />}
      <main id="fs-main" className={styles.content} tabIndex={-1}>
        {children}
      </main>
      {status && <StatusBar left={status.left} right={status.right} />}
    </div>
  );
}
