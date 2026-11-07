import { IconButton, Menu } from '@free360/ui';
import { MoreHorizontal, Plus } from 'lucide-react';
import styles from './SheetTabs.module.css';
import type { Sheet } from './workbook';

type SheetTabsProps = {
  sheets: Sheet[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export function SheetTabs({
  sheets,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: SheetTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Sheets">
      {sheets.map((sheet) => (
        <div key={sheet.id} className={styles.tab} data-active={sheet.id === activeId}>
          <button
            type="button"
            role="tab"
            aria-selected={sheet.id === activeId}
            className={styles.name}
            onClick={() => onSelect(sheet.id)}
            onDoubleClick={() => onRename(sheet.id)}
          >
            {sheet.name}
          </button>
          {sheet.id === activeId && (
            <Menu
              align="start"
              trigger={
                <IconButton label={`Options for ${sheet.name}`} className={styles.more}>
                  <MoreHorizontal size={14} aria-hidden />
                </IconButton>
              }
              items={[
                { label: 'Rename', onSelect: () => onRename(sheet.id) },
                {
                  label: 'Delete',
                  danger: true,
                  disabled: sheets.length < 2,
                  onSelect: () => onDelete(sheet.id),
                },
              ]}
            />
          )}
        </div>
      ))}
      <IconButton label="Add sheet" onClick={onAdd}>
        <Plus size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
