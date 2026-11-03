# Free 360

Open-source, local-first office suite that runs entirely in the browser:
**FreeWrite** (documents), **FreeGrid** (spreadsheets), **FreeDeck** (slides).
No backend, no accounts. Documents live in IndexedDB; files are imported/exported explicitly.

License: **GPLv3** (required by HyperFormula's free license). Every dependency must be
GPLv3-compatible (MIT, BSD, Apache-2.0, ISC, MPL-2.0, LGPL, GPL). Do not add paid/"Pro" packages
(e.g. TipTap Pro extensions, SheetJS Pro). Ask the user before adding any large dependency.

The UI follows the general office-suite pattern (ribbon, tabs, status bar) but uses its own
name, icons, colors, and wording. Never use Microsoft trademarks, icons, or assets.

## Commands

Requires Node 24+ and pnpm 10+ (`npm install -g pnpm@10`; Node 25+ no longer bundles corepack).

```sh
pnpm install          # install all workspace deps
pnpm dev              # run the app (apps/web) at http://localhost:5173
pnpm build            # typecheck + production build
pnpm test             # Vitest unit tests, all packages
pnpm test:e2e         # Playwright end-to-end tests (builds + previews the app)
pnpm lint             # ESLint
pnpm format           # Prettier write
pnpm typecheck        # tsc --noEmit across the workspace
```

TypeScript is pinned to `~6.0` because typescript-eslint does not support TypeScript 7 yet;
don't upgrade it until typescript-eslint does.

Vitest runs from the root with one config. Filter by path: `pnpm test packages/storage`.
First-time e2e setup: `pnpm exec playwright install chromium`.

## Structure

```
apps/web/          Vite host: routing, home screen, app shell; lazy-loads each app package
packages/core/     shared types (DocMeta, DocKind, IDs) and small helpers; no React
packages/storage/  Dexie (IndexedDB) repository, file open/save, import/export plumbing
packages/commands/ command registry, keyboard shortcuts, undo/redo stack interface
packages/ui/       ribbon, tabs, menus, dialogs, status bar, theme provider (Radix + CSS Modules)
packages/write/    FreeWrite: TipTap editor, .docx (docx/mammoth), print-to-PDF
packages/grid/     FreeGrid: virtualized grid, HyperFormula adapter, .xlsx (ExcelJS), .csv (PapaParse)
packages/deck/     FreeDeck: react-konva editor, presenter mode, .pptx (PptxGenJS), PDF (jsPDF)
e2e/               Playwright tests for core user flows
docs/ROADMAP.md    milestones and their status
```

Dependency direction: `core` <- `storage`, `commands` <- `ui` <- `write`/`grid`/`deck` <- `apps/web`.
Packages never import from `apps/web`, and app packages never import each other (cross-app
features go through `core` types and `storage`).

## Key design rules

- **One host app.** All three apps are routes in `apps/web` (`/`, `/write/:id`, `/grid/:id`,
  `/deck/:id`) so they share one IndexedDB origin. Each app package is loaded with `React.lazy`.
- **Commands are the single source of truth.** Every user action is registered once in the
  command registry (id like `write.bold`, label, icon, shortcut, `isEnabled`, `run`). Ribbon
  buttons, menus, shortcuts, and the command palette all read from the registry; never wire a
  button or keybinding directly to logic.
- **Undo/redo** goes through the `UndoStack` interface from `@free360/commands`. FreeWrite adapts
  TipTap history; FreeGrid wraps HyperFormula ops + formatting in one command; FreeDeck uses Immer
  patches.
- **Storage:** metadata (`docs` table) is separate from content (`contents` table) so the home
  screen never loads document bodies. Content is a versioned JSON payload per app
  (`{ kind, schemaVersion, data }`); bump `schemaVersion` and add a migration when the shape changes.
- **Heavy libraries are lazy.** Import/export libs (docx, mammoth, ExcelJS, PptxGenJS, jsPDF) are
  loaded with dynamic `import()` only when used.
- **Theming** uses CSS custom properties defined in `packages/ui/src/theme/`. No hard-coded colors
  in components; use `var(--fs-*)` tokens.

## Conventions

- TypeScript strict mode. No `any` (use `unknown` and narrow). Prefer `type` over `interface`
  except for extendable component props.
- React function components and hooks only. One component per file, named export, file named
  after the component (`Ribbon.tsx`). Styles in a sibling `Ribbon.module.css`.
- Packages are named `@free360/<name>` and export from `src/index.ts`. They are consumed as
  TypeScript source (no per-package build step).
- Tests live next to the code: `foo.ts` -> `foo.test.ts`. Unit tests are required for the formula
  adapter, storage, commands, and every import/export format (round-trip tests). Playwright
  covers core user flows per app.
- IndexedDB in unit tests uses `fake-indexeddb`.
- Keep components accessible: real buttons, labels, keyboard operation, visible focus.
  Radix primitives for menus, dialogs, tooltips, tabs.
- Commit after each milestone (or a coherent sub-step) with a descriptive message; tests and
  typecheck must pass first.
