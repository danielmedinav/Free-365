# Free 360

A free, open-source office suite that runs entirely in your browser:

- **FreeWrite**: documents
- **FreeGrid**: spreadsheets
- **FreeDeck**: presentations

Local-first: your files are stored in your browser (IndexedDB), never on a server. There are
no accounts and no backend. Import and export Office-compatible files (.docx, .xlsx, .pptx)
whenever you want a copy on disk.

> **Status:** early development. The app shell and home screen work; the editors arrive
> milestone by milestone. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Getting started

Requires [Node.js](https://nodejs.org/) 24+ and pnpm 10+ (`npm install -g pnpm@10`).

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

Other commands:

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `pnpm build`    | Typecheck and build for production |
| `pnpm test`     | Unit tests (Vitest)                |
| `pnpm test:e2e` | End-to-end tests (Playwright)      |
| `pnpm lint`     | Lint (ESLint)                      |
| `pnpm format`   | Format (Prettier)                  |

The first time you run end-to-end tests: `pnpm exec playwright install chromium`.

## Project layout

```
apps/web           the app you run: home screen, routing, shared shell
packages/core      shared document types
packages/storage   IndexedDB storage and file import/export helpers
packages/commands  command registry, keyboard shortcuts, undo/redo
packages/ui        ribbon, menus, dialogs, themes
packages/write     FreeWrite
packages/grid      FreeGrid
packages/deck      FreeDeck
```

Contributor conventions are in [CLAUDE.md](CLAUDE.md).

## Your data

Everything stays in this browser's storage. Clearing site data or using a private window
removes it, and other browsers or devices don't see it. Free 360 asks the browser to keep the
data persistent, but export anything important.

## License

[GPL-3.0-or-later](LICENSE). Free 360 uses [HyperFormula](https://hyperformula.handsontable.com/)
under its GPLv3 license. Free 360 is an independent project and is not affiliated with or
endorsed by Microsoft.
