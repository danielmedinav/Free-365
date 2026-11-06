import { Button, useRegistry } from '@free360/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import styles from './FindBar.module.css';
import { findReplaceKey } from './findReplace';

type FindBarProps = {
  editor: Editor;
  mode: 'find' | 'replace';
  /** Changes each time Find is invoked, to pull focus back to the search box. */
  focusKey: number;
};

export function FindBar({ editor, mode, focusKey }: FindBarProps) {
  const registry = useRegistry();
  const inputRef = useRef<HTMLInputElement>(null);
  const find = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const state = findReplaceKey.getState(e.state);
      return {
        query: state?.query ?? '',
        replacement: state?.replacement ?? '',
        caseSensitive: state?.caseSensitive ?? false,
        count: state?.matches.length ?? 0,
        current: state?.current ?? -1,
      };
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  const hasMatches = find.count > 0;
  const position = hasMatches ? `${find.current + 1} of ${find.count}` : 'No matches';

  const onQueryKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    registry.execute(event.shiftKey ? 'write.findPrevious' : 'write.findNext');
  };

  const onReplacementKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    registry.execute('write.replaceCurrent');
  };

  return (
    <div className={styles.bar} role="search" aria-label="Find in document">
      <div className={styles.row}>
        <input
          ref={inputRef}
          className={styles.field}
          type="text"
          aria-label="Find"
          placeholder="Find"
          value={find.query}
          onChange={(e) => editor.commands.setFind({ query: e.target.value })}
          onKeyDown={onQueryKeyDown}
        />
        <span className={styles.count} role="status">
          {find.query ? position : ''}
        </span>
        <Button disabled={!hasMatches} onClick={() => registry.execute('write.findPrevious')}>
          Previous
        </Button>
        <Button disabled={!hasMatches} onClick={() => registry.execute('write.findNext')}>
          Next
        </Button>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={find.caseSensitive}
            onChange={(e) => editor.commands.setFind({ caseSensitive: e.target.checked })}
          />
          Match case
        </label>
        <Button
          variant="ghost"
          className={styles.close}
          onClick={() => registry.execute('write.closeFind')}
        >
          Close
        </Button>
      </div>
      {mode === 'replace' && (
        <div className={styles.row}>
          <input
            className={styles.field}
            type="text"
            aria-label="Replace with"
            placeholder="Replace with"
            value={find.replacement}
            onChange={(e) => editor.commands.setFind({ replacement: e.target.value })}
            onKeyDown={onReplacementKeyDown}
          />
          <Button disabled={!hasMatches} onClick={() => registry.execute('write.replaceCurrent')}>
            Replace
          </Button>
          <Button disabled={!hasMatches} onClick={() => registry.execute('write.replaceAll')}>
            Replace all
          </Button>
        </div>
      )}
    </div>
  );
}
