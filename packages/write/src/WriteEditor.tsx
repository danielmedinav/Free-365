import { APPS } from '@free360/core';
import { pickFiles, saveBlob, toFileName, type FileTypeOption } from '@free360/storage';
import {
  AppShell,
  Button,
  ConfirmDialog,
  DialogFrame,
  useRegisterCommands,
  useRegistry,
  type EditorAppProps,
} from '@free360/ui';
import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { closeHistory } from '@tiptap/pm/history';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createAutosaver, type SaveStatus } from './autosave';
import { createWriteCommands } from './commands';
import { WRITE_SCHEMA_VERSION, type WriteData } from './content';
import { writeDraft } from './draft';
import { writeExtensions } from './extensions';
import { FindBar } from './FindBar';
import {
  IMAGE_FILE_TYPE,
  ImageRejectedError,
  imageFilesIn,
  imageFileToDataUrl,
  insertImageFiles,
} from './images';
import { countWords } from './wordCount';
import styles from './WriteEditor.module.css';
import { buildWriteRibbon } from './writeRibbon';

const DOCX_FILE_TYPE: FileTypeOption = {
  description: 'Document',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extensions: ['.docx'],
};

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved locally',
  pending: 'Saving…',
  saving: 'Saving…',
  error: 'Could not save. Export a copy to keep your work.',
};

type WriteEditorProps = EditorAppProps & { initialDoc: JSONContent };

export function WriteEditor({ meta, repo, shell, fileTab, initialDoc }: WriteEditorProps) {
  const registry = useRegistry();
  const [find, setFind] = useState<{ mode: 'find' | 'replace'; focusKey: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ doc: JSONContent; title: string } | null>(
    null,
  );

  const reportImageError = (error: unknown) => {
    console.error(error);
    setNotice(error instanceof ImageRejectedError ? error.message : 'Could not insert the image.');
  };

  const editor = useEditor({
    extensions: [...writeExtensions, Placeholder.configure({ placeholder: 'Start typing…' })],
    content: initialDoc,
    autofocus: 'end',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body',
      },
      handlePaste(view, event) {
        const files = imageFilesIn(event.clipboardData);
        // Copying from another app often offers an image alongside the real text; prefer the text.
        if (!files.length || event.clipboardData?.getData('text/plain')) return false;
        void insertImageFiles(view, files, reportImageError);
        return true;
      },
      handleDrop(view, event) {
        const files = imageFilesIn(event.dataTransfer);
        if (!files.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImageFiles(view, files, reportImageError, pos);
        return true;
      },
    },
  });

  const autosaver = useMemo(
    () =>
      createAutosaver({
        save: () =>
          repo.saveContent<WriteData>(meta.id, { doc: editor.getJSON() }, WRITE_SCHEMA_VERSION),
      }),
    [editor, repo, meta.id],
  );
  const saveStatus = useSyncExternalStore(autosaver.subscribe, autosaver.getStatus);

  useEffect(() => {
    const onUpdate = () => autosaver.markDirty();
    const onTransaction = () => registry.notify();
    const onLeave = () => {
      if (autosaver.getStatus() === 'saved') return;
      writeDraft(meta.id, editor.getJSON());
      void autosaver.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void autosaver.flush();
    };
    editor.on('update', onUpdate);
    editor.on('transaction', onTransaction);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      editor.off('update', onUpdate);
      editor.off('transaction', onTransaction);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      void autosaver.flush();
    };
  }, [editor, autosaver, registry, meta.id]);

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { doc } = e.state;
      return countWords(doc.textBetween(0, doc.content.size, ' ', ' '));
    },
  });

  const applyImport = (doc: JSONContent, title: string) => {
    editor
      .chain()
      .command(({ tr }) => {
        closeHistory(tr); // undo restores what was here, not an older state
        return true;
      })
      .setContent(doc)
      .focus('start')
      .run();
    if (meta.title === APPS.write.defaultTitle) shell.onTitleChange?.(title);
  };

  useRegisterCommands(
    createWriteCommands(editor, {
      openFind(mode) {
        const { from, to, empty } = editor.state.selection;
        const selected = empty ? '' : editor.state.doc.textBetween(from, to, '\n');
        if (selected && !selected.includes('\n')) editor.commands.setFind({ query: selected });
        setFind((prev) => ({ mode, focusKey: (prev?.focusKey ?? 0) + 1 }));
      },
      closeFind() {
        setFind(null);
        editor.chain().setFind({ query: '' }).focus().run();
      },
      isFindOpen: () => find !== null,
      save: () => autosaver.flush(),
      async insertImage() {
        const [file] = await pickFiles([IMAGE_FILE_TYPE]);
        if (!file) return;
        try {
          const src = await imageFileToDataUrl(file);
          editor.chain().focus().setImage({ src, alt: file.name }).run();
        } catch (error) {
          reportImageError(error);
        }
      },
      async importDocx() {
        const [file] = await pickFiles([DOCX_FILE_TYPE]);
        if (!file) return;
        try {
          const { importDocx } = await import('./docx/importDocx');
          const doc = await importDocx(await file.arrayBuffer());
          const title = file.name.replace(/\.docx$/i, '');
          if (editor.isEmpty) applyImport(doc, title);
          else setPendingImport({ doc, title });
        } catch (error) {
          console.error(error);
          setNotice(`Could not read “${file.name}”. It may be damaged or not a .docx file.`);
        }
      },
      async exportDocx() {
        try {
          const { exportDocx } = await import('./docx/exportDocx');
          const blob = await exportDocx(editor.getJSON(), meta.title);
          await saveBlob(blob, toFileName(meta.title, 'docx'), DOCX_FILE_TYPE);
        } catch (error) {
          console.error(error);
          setNotice('Could not export this document.');
        }
      },
      print: () => window.print(),
    }),
  );

  return (
    <AppShell
      {...shell}
      ribbon={buildWriteRibbon(fileTab)}
      status={{
        left: (
          <>
            <span>FreeWrite</span>
            <span>{words === 1 ? '1 word' : `${words} words`}</span>
          </>
        ),
        right: <span role="status">{SAVE_LABELS[saveStatus]}</span>,
      }}
    >
      {find && <FindBar editor={editor} mode={find.mode} focusKey={find.focusKey} />}
      <div className={styles.desk}>
        <EditorContent editor={editor} className={styles.page} />
      </div>
      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        title="Replace this document?"
        description="The imported file will replace what's here now. You can undo this."
        confirmLabel="Replace"
        onConfirm={() => {
          if (pendingImport) applyImport(pendingImport.doc, pendingImport.title);
        }}
      />
      <DialogFrame
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        title="Something went wrong"
        description={notice}
      >
        <div className={styles.noticeActions}>
          <Button variant="primary" onClick={() => setNotice(null)}>
            OK
          </Button>
        </div>
      </DialogFrame>
    </AppShell>
  );
}
