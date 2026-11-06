export type PageNumberPlacement = 'none' | 'header' | 'footer';

/** Sizes are in inches. Stored on the document itself, so undo and autosave cover it. */
export type PageSetup = {
  widthIn: number;
  heightIn: number;
  marginTopIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  marginRightIn: number;
  headerText: string;
  footerText: string;
  pageNumbers: PageNumberPlacement;
};

export const PX_PER_INCH = 96;

export const DEFAULT_PAGE_SETUP: PageSetup = {
  widthIn: 8.5,
  heightIn: 11,
  marginTopIn: 1,
  marginBottomIn: 1,
  marginLeftIn: 1,
  marginRightIn: 1,
  headerText: '',
  footerText: '',
  pageNumbers: 'none',
};

/** Given in portrait; landscape swaps them. */
export const PAGE_SIZES = [
  { id: 'letter', label: 'Letter', widthIn: 8.5, heightIn: 11 },
  { id: 'a4', label: 'A4', widthIn: 8.27, heightIn: 11.69 },
  { id: 'legal', label: 'Legal', widthIn: 8.5, heightIn: 14 },
];

export const MARGIN_PRESETS = [
  { id: 'normal', label: 'Normal', top: 1, bottom: 1, left: 1, right: 1 },
  { id: 'narrow', label: 'Narrow', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  { id: 'wide', label: 'Wide', top: 1, bottom: 1, left: 2, right: 2 },
];

const MIN_PAGE_IN = 3;
const MAX_PAGE_IN = 22;
/** The text area always keeps at least this much room, whatever the margins say. */
const MIN_CONTENT_IN = 1;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Shrinks a pair of opposite margins, keeping their proportions, if they leave too little room. */
function fitMargins(a: number, b: number, page: number): [number, number] {
  const room = page - MIN_CONTENT_IN;
  const total = a + b;
  return total > room ? [(a / total) * room, (b / total) * room] : [a, b];
}

/** Makes any stored or imported value safe to lay out. */
export function readPageSetup(value: unknown): PageSetup {
  const raw = (typeof value === 'object' && value ? value : {}) as Partial<
    Record<keyof PageSetup, unknown>
  >;
  const fallback = DEFAULT_PAGE_SETUP;
  const widthIn = clamp(finite(raw.widthIn, fallback.widthIn), MIN_PAGE_IN, MAX_PAGE_IN);
  const heightIn = clamp(finite(raw.heightIn, fallback.heightIn), MIN_PAGE_IN, MAX_PAGE_IN);
  const margin = (side: unknown, otherwise: number) => Math.max(finite(side, otherwise), 0);
  const [marginTopIn, marginBottomIn] = fitMargins(
    margin(raw.marginTopIn, fallback.marginTopIn),
    margin(raw.marginBottomIn, fallback.marginBottomIn),
    heightIn,
  );
  const [marginLeftIn, marginRightIn] = fitMargins(
    margin(raw.marginLeftIn, fallback.marginLeftIn),
    margin(raw.marginRightIn, fallback.marginRightIn),
    widthIn,
  );
  return {
    widthIn,
    heightIn,
    marginTopIn,
    marginBottomIn,
    marginLeftIn,
    marginRightIn,
    headerText: typeof raw.headerText === 'string' ? raw.headerText : '',
    footerText: typeof raw.footerText === 'string' ? raw.footerText : '',
    pageNumbers:
      raw.pageNumbers === 'header' || raw.pageNumbers === 'footer' ? raw.pageNumbers : 'none',
  };
}

export function isLandscape(setup: PageSetup): boolean {
  return setup.widthIn > setup.heightIn;
}

/** Changes the paper size, keeping the current orientation. */
export function withPageSize(setup: PageSetup, size: { widthIn: number; heightIn: number }) {
  return isLandscape(setup)
    ? { widthIn: size.heightIn, heightIn: size.widthIn }
    : { widthIn: size.widthIn, heightIn: size.heightIn };
}

export function withOrientation(setup: PageSetup, landscape: boolean) {
  const long = Math.max(setup.widthIn, setup.heightIn);
  const short = Math.min(setup.widthIn, setup.heightIn);
  return landscape ? { widthIn: long, heightIn: short } : { widthIn: short, heightIn: long };
}

export function matchesPageSize(
  setup: PageSetup,
  size: { widthIn: number; heightIn: number },
): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.02;
  const { widthIn, heightIn } = withOrientation(setup, false);
  return close(widthIn, size.widthIn) && close(heightIn, size.heightIn);
}

export function matchesMargins(
  setup: PageSetup,
  margins: { top: number; bottom: number; left: number; right: number },
): boolean {
  return (
    setup.marginTopIn === margins.top &&
    setup.marginBottomIn === margins.bottom &&
    setup.marginLeftIn === margins.left &&
    setup.marginRightIn === margins.right
  );
}
