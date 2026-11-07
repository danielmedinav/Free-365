# Free 360 roadmap

Status key: ⬜ not started · 🟨 in progress · ✅ done

## Milestone 0: Foundation ✅

- pnpm monorepo, TypeScript strict, ESLint/Prettier, Vitest, Playwright
- `@free360/core`: document types, ID generation
- `@free360/storage`: Dexie database (docs + contents), create/rename/delete/list-recent,
  persistent-storage request, file download/open helpers
- `@free360/commands`: command registry, shortcut parsing and dispatch, `UndoStack` interface
- `@free360/ui`: theme provider (light/dark/system), app shell, ribbon with tabs, status bar,
  dialog and menu wrappers
- `apps/web`: routing, home screen (recent files across all apps, new document, rename,
  delete, theme toggle), placeholder editor routes
- Tests: storage and commands unit tests; Playwright test that creates, lists, renames, deletes

## Milestone 1: FreeWrite MVP ✅

Headings, bold/italic/underline, lists, tables, images, alignment, find/replace, paper-style
page view, undo/redo, autosave, .docx export and import (mammoth), PDF via print.

Also added: fonts, sizes, text and highlight colors, line spacing, indents, links,
superscript/subscript, and clear formatting.

Page layout: real on-screen pages, page breaks, paper size, orientation, margins, one-line headers
and footers, and page numbers, all kept in .docx export and import and matched when printing.

Images and tables: drag or button resizing, image position and text wrap, column resizing, merged
cells, and cell colors, all kept in .docx export and import.

References: live table of contents, footnotes at the bottom of their page, column sections, a symbol
picker, and a switch for the browser's spell checker, all but the last two kept in .docx export and
import.

Known gaps, for later: footnotes are plain text, and an exported table of contents is a snapshot of
FreeWrite's page numbers rather than a field other programs update. A column section can't split
across pages, so one taller than a page runs across the gap. .docx import replaces the open document (no import from the home screen),
and reads formatting set directly on text and paragraphs, but not formatting inherited from named
styles or themes. Headers and footers are one plain line, the same on every page. A table row taller
than a page runs across the gap, a cell merged across rows that a page break falls between runs
across it too, and header rows don't repeat on later pages. Wrapped images sit at the left or right
margin only; they can't be dragged to any spot on the page.

## Milestone 2: FreeGrid MVP ✅

Virtualized grid, cell editing, formula bar, HyperFormula (SUM, AVERAGE, IF, VLOOKUP, ...),
number/text formatting, multiple sheets, Chart.js charts, sort/filter, .xlsx and .csv
import/export.

Known gaps, for later: no drag-to-fill handle, merged cells, frozen panes, row height changes,
conditional formatting, or printing. Charts go into .xlsx files as pictures, and .xlsx import leaves
out charts and pictures. A sheet holds up to 10,000 rows and 100 columns.

## Milestone 3: FreeDeck MVP ⬜

Slide sorter, text/shapes/images, layouts and themes, presenter mode, simple transitions,
.pptx export, PDF export.

## Milestone 4: Cross-app ⬜

Embed FreeGrid charts/tables into FreeWrite and FreeDeck, shared themes, command palette.

## Milestone 5: Polish ⬜

Accessibility audit, large-file performance, coverage, offline install (PWA), README.

## Known limitations (by design)

- Page view is a paper-style layout, not true pagination.
- .docx import keeps structure, not exact formatting.
- .xlsx charts are not exported as native Excel charts.
- .pptx import is out of scope for the MVP.
