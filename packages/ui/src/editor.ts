import type { DocMeta, DocRepository } from '@free360/core';
import type { RibbonTab } from './ribbon/types';
import type { AppShellProps } from './shell/AppShell';

/**
 * Props the host passes to each app's editor component. The app renders
 * `<AppShell {...shell} ribbon={[fileTab, ...ownTabs]}>` so all apps share the same
 * top bar, File tab, and navigation.
 */
export type EditorAppProps = {
  meta: DocMeta;
  repo: DocRepository;
  shell: Pick<AppShellProps, 'app' | 'title' | 'onTitleChange' | 'onHome' | 'actions'>;
  fileTab: RibbonTab;
};
