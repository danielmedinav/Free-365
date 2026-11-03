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

## Milestone 1: FreeWrite MVP ⬜

Headings, bold/italic/underline, lists, tables, images, alignment, find/replace, paper-style
page view, undo/redo, autosave, .docx export and import (mammoth), PDF via print.

## Milestone 2: FreeGrid MVP ⬜

Virtualized grid, cell editing, formula bar, HyperFormula (SUM, AVERAGE, IF, VLOOKUP, ...),
number/text formatting, multiple sheets, Chart.js charts, sort/filter, .xlsx and .csv
import/export.

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
