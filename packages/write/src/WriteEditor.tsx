import { APPS } from '@free360/core';
import { pickFiles, saveBlob, toFileName, type FileTypeOption } from '@free360/storage';
import {
  AppShell,
  Button,
  ConfirmDialog,
  DialogFrame,
  PromptDialog,
  useRegisterCommands,
  useRegistry,
  type EditorAppProps,
} from '@free360/ui';
import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PmNode } from '@tiptap/pm/model';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createAutosaver, type SaveStatus } from './autosave';
import { createWriteCommands } from './commands';
import { WRITE_SCHEMA_VERSION, type WriteData } from './content';
import { writeDraft } from './draft';
import { writeExtensions } from './extensions';
import { FindBar } from './FindBar';
import { normalizeLink } from './formatting';
import {
  IMAGE_FILE_TYPE,
  ImageRejectedError,
  imageFilesIn,
  imageFileToDataUrl,
  insertImageFiles,
} from './images';
import { Pagination, pageOfPosition, paginationKey } from './paginationPlugin';
import { PageSetupDialog } from './PageSetupDialog';
import { PageSheets } from './PageSheets';
import { PX_PER_INCH, readPageSetup } from './pageSetup';
import { collectFootnotes, headingPages } from './references';
import { SymbolDialog } from './SymbolDialog';
import { countWords } from './wordCount';
import styles from './WriteEditor.module.css';
import { buildWriteRibbon } from './writeRibbon';

const DOCX_FILE_TYPE: FileTypeOption = {
  description: 'Document',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extensions: ['.docx'],
};

const SPELL_CHECK_KEY = 'free360.write.spellCheck';

function readSpellCheck(): boolean {
  return localStorage.getItem(SPELL_CHECK_KEY) !== 'off';
}

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
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [spellCheck, setSpellCheck] = useState(readSpellCheck);
  // The note being written or edited; `pos` is null for a new one.
  const [footnoteDraft, setFootnoteDraft] = useState<{ text: string; pos: number | null } | null>(
    null,
  );
  const [pendingImport, setPendingImport] = useState<{ doc: JSONContent; title: string } | null>(
    null,
  );

  const reportImageError = (error: unknown) => {
    console.error(error);
    setNotice(error instanceof ImageRejectedError ? error.message : 'Could not insert the image.');
  };

  const openFootnote = (node: PmNode, pos: number) => {
    if (node.type.name !== 'footnote') return false;
    setFootnoteDraft({ text: String(node.attrs.text ?? ''), pos });
    return true;
  };

  const editor = useEditor({
    extensions: [
      ...writeExtensions,
      Pagination,
      Placeholder.configure({ placeholder: 'Start typing…' }),
    ],
    content: initialDoc,
    autofocus: 'end',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body',
        spellcheck: String(spellCheck),
      },
      handleClickOn(_view, _pos, node, nodePos) {
        return openFootnote(node, nodePos);
      },
      handleDoubleClickOn(_view, _pos, node, nodePos) {
        return openFootnote(node, nodePos);
      },
      handleClick(_view, _pos, event) {
        if (!event.ctrlKey && !event.metaKey) return false;
        const href = (event.target as HTMLElement).closest('a')?.getAttribute('href');
        if (!href) return false;
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
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

  const setup = useEditorState({
    editor,
    selector: ({ editor: e }) => readPageSetup(e.state.doc.attrs.pageSetup),
  });
  const pages = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const gaps = paginationKey.getState(e.state)?.gaps ?? [];
      return {
        count: gaps.length + 1,
        current: pageOfPosition(gaps, e.state.selection.from),
      };
    },
  });

  const footnotes = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const gaps = paginationKey.getState(e.state)?.gaps ?? [];
      return collectFootnotes(e.state.doc).map(({ pos, number, text }) => ({
        number,
        text,
        page: pageOfPosition(gaps, pos),
      }));
    },
  });

  const applyFootnote = (text: string) => {
    const pos = footnoteDraft?.pos ?? null;
    const note = text.trim();
    if (pos === null) {
      if (note) {
        editor
          .chain()
          .focus()
          .insertContent({ type: 'footnote', attrs: { text: note } })
          .run();
      }
      return;
    }
    // Emptying a note removes it, along with its number in the text.
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        if (note) tr.setNodeAttribute(pos, 'text', note);
        else tr.delete(pos, pos + 1);
        return true;
      })
      .run();
  };

  const applyImport = (doc: JSONContent, title: string) => {
    editor
      .chain()
      .command(({ tr }) => {
        closeHistory(tr); // undo restores what was here, not an older state
        return true;
      })
      .setContent(doc)
      .updatePageSetup(readPageSetup(doc.attrs?.pageSetup))
      .focus('start')
      .run();
    if (meta.title === APPS.write.defaultTitle) shell.onTitleChange?.(title);
  };

  const applyLink = (input: string) => {
    if (!input.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = normalizeLink(input);
    if (!href) {
      setNotice(`“${input}” can't be used as a link. Try an address like example.com.`);
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      const link = { type: 'link', attrs: { href } };
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: input.trim(), marks: [link] })
        .unsetMark('link')
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
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
      editLink: () => setLinkDraft(String(editor.getAttributes('link').href ?? '')),
      openPageSetup: () => setPageSetupOpen(true),
      editFootnote() {
        const { selection, doc } = editor.state;
        const selected = doc.nodeAt(selection.from);
        const editing = !selection.empty && selected?.type.name === 'footnote';
        setFootnoteDraft(
          editing
            ? { text: String(selected.attrs.text ?? ''), pos: selection.from }
            : { text: '', pos: null },
        );
      },
      openSymbols: () => setSymbolsOpen(true),
      toggleSpellCheck() {
        setSpellCheck((on) => {
          localStorage.setItem(SPELL_CHECK_KEY, on ? 'off' : 'on');
          return !on;
        });
      },
      isSpellCheckOn: () => spellCheck,
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
          const blob = await exportDocx(editor.getJSON(), meta.title, headingPages(editor.state));
          await saveBlob(blob, toFileName(meta.title, 'docx'), DOCX_FILE_TYPE);
        } catch (error) {
          console.error(error);
          setNotice('Could not export this document.');
        }
      },
      print: () => window.print(),
    }),
  );

  // The ribbon reads the spell check state through its command, so it needs telling.
  useEffect(() => registry.notify(), [registry, spellCheck]);

  return (
    <AppShell
      {...shell}
      ribbon={buildWriteRibbon(fileTab, editor)}
      status={{
        left: (
          <>
            <span>FreeWrite</span>
            <span>{`Page ${pages.current} of ${pages.count}`}</span>
            <span>{words === 1 ? '1 word' : `${words} words`}</span>
          </>
        ),
        right: <span role="status">{SAVE_LABELS[saveStatus]}</span>,
      }}
    >
      {find && <FindBar editor={editor} mode={find.mode} focusKey={find.focusKey} />}
      {/* Each document can have its own paper size, and printing has to use it. */}
      <style>{`@page { size: ${setup.widthIn}in ${setup.heightIn}in; margin: 0; }`}</style>
      <div className={styles.desk}>
        <div
          className={`${styles.pages} fs-paper`}
          style={
            {
              '--fs-page-width': `${setup.widthIn * PX_PER_INCH}px`,
              '--fs-page-height': `${setup.heightIn * PX_PER_INCH}px`,
              '--fs-margin-top': `${setup.marginTopIn * PX_PER_INCH}px`,
              '--fs-margin-bottom': `${setup.marginBottomIn * PX_PER_INCH}px`,
              '--fs-margin-left': `${setup.marginLeftIn * PX_PER_INCH}px`,
              '--fs-margin-right': `${setup.marginRightIn * PX_PER_INCH}px`,
              '--fs-page-count': pages.count,
            } as CSSProperties
          }
        >
          <PageSheets setup={setup} pageCount={pages.count} footnotes={footnotes} />
          <EditorContent editor={editor} className={styles.page} />
        </div>
      </div>
      <PromptDialog
        open={footnoteDraft !== null}
        onOpenChange={(open) => {
          if (!open) setFootnoteDraft(null);
        }}
        title="Footnote"
        description={
          footnoteDraft?.pos === null ? undefined : 'Leave this empty to remove the footnote.'
        }
        label="Footnote text"
        initialValue={footnoteDraft?.text ?? ''}
        confirmLabel="Save"
        onSubmit={applyFootnote}
      />
      <SymbolDialog
        open={symbolsOpen}
        onOpenChange={setSymbolsOpen}
        onPick={(symbol) => editor.chain().focus().insertContent(symbol).run()}
      />
      <PageSetupDialog
        setup={setup}
        open={pageSetupOpen}
        onOpenChange={setPageSetupOpen}
        onSave={(patch) => editor.chain().focus().updatePageSetup(patch).run()}
      />
      <PromptDialog
        open={linkDraft !== null}
        onOpenChange={(open) => {
          if (!open) setLinkDraft(null);
        }}
        title="Link"
        description="Leave this empty to remove the link."
        label="Web or email address"
        initialValue={linkDraft ?? ''}
        confirmLabel="Save"
        onSubmit={applyLink}
      />
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
