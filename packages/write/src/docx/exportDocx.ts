import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';
import { INDENT_STEP_INCHES, primaryFont, toHexColor, toPoints } from '../formatting';
import { isLandscape, PX_PER_INCH, readPageSetup, type PageSetup } from '../pageSetup';
import { readImageSize } from './imageSize';
import { CODE_BLOCK_STYLE, DIVIDER_STYLE, INLINE_CODE_STYLE, QUOTE_STYLE } from './styleNames';

const ORDERED_LIST = 'fs-ordered';
const MAX_LIST_LEVEL = 8;
const LIST_INDENT_TWIPS = 360;
const TWIPS_PER_INCH = 1440;
const SINGLE_LINE = 240;
/** Matches the editor's default look, so documents keep their shape in other programs. */
const DEFAULT_LINE_SPACING = 1.15;
const DEFAULT_PARAGRAPH_GAP_TWIPS = 120;

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const ALIGNMENTS: Record<string, IParagraphOptions['alignment']> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.BOTH,
};

const IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

type Block = Paragraph | Table;

type BlockContext = {
  listLevel: number;
  paragraph: IParagraphOptions;
};

function twips(inches: number): number {
  return Math.round(inches * TWIPS_PER_INCH);
}

/** The width between the left and right margins. */
function contentWidthInches(setup: PageSetup): number {
  return setup.widthIn - setup.marginLeftIn - setup.marginRightIn;
}

function decodeDataUrl(src: string) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(src);
  if (!match) return undefined;
  const binary = atob(match[2]!);
  return { mimeType: match[1]!, bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
}

function textRun(node: JSONContent): ParagraphChild {
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  const link = marks.find((m) => m.type === 'link');
  const textStyle = marks.find((m) => m.type === 'textStyle')?.attrs;
  const color = toHexColor(textStyle?.color);
  const background = toHexColor(textStyle?.backgroundColor);
  const points = toPoints(textStyle?.fontSize);
  const run = new TextRun({
    text: node.text ?? '',
    bold: has('bold'),
    italics: has('italic'),
    strike: has('strike'),
    underline: has('underline') ? {} : undefined,
    superScript: has('superscript'),
    subScript: has('subscript'),
    font: primaryFont(textStyle?.fontFamily),
    size: points === undefined ? undefined : Math.round(points * 2),
    color: color?.slice(1),
    shading: background
      ? { type: ShadingType.CLEAR, color: 'auto', fill: background.slice(1) }
      : undefined,
    style: has('code') ? 'InlineCode' : link ? 'Hyperlink' : undefined,
  });
  const href: unknown = link?.attrs?.href;
  return typeof href === 'string' && href
    ? new ExternalHyperlink({ link: href, children: [run] })
    : run;
}

function inlineChildren(nodes: JSONContent[] | undefined): ParagraphChild[] {
  return (nodes ?? []).map((node) =>
    node.type === 'hardBreak' ? new TextRun({ break: 1 }) : textRun(node),
  );
}

/** The paragraph-level settings shared by paragraphs and headings. */
function blockFormat(node: JSONContent, context: BlockContext): IParagraphOptions {
  const spacing = Number(node.attrs?.lineSpacing ?? 0);
  const indent = Number(node.attrs?.indent ?? 0);
  return {
    ...context.paragraph,
    alignment: ALIGNMENTS[String(node.attrs?.textAlign)],
    ...(spacing ? { spacing: { line: Math.round(spacing * SINGLE_LINE) } } : {}),
    ...(indent
      ? { indent: { left: Math.round(indent * INDENT_STEP_INCHES * TWIPS_PER_INCH) } }
      : {}),
  };
}

function imageParagraph(node: JSONContent, context: BlockContext, maxWidthPx: number): Paragraph {
  const src = String(node.attrs?.src ?? '');
  const alt = String(node.attrs?.alt ?? '');
  const decoded = decodeDataUrl(src);
  const type = decoded && IMAGE_TYPES[decoded.mimeType];
  const size = decoded && readImageSize(decoded.bytes);

  if (!decoded || !type || !size) {
    // Linked images and formats .docx can't embed: keep a visible trace instead of dropping them.
    const label = `[Image${alt ? `: ${alt}` : ''}]`;
    const children = src.startsWith('http')
      ? [new ExternalHyperlink({ link: src, children: [new TextRun({ text: label })] })]
      : [new TextRun({ text: label })];
    return new Paragraph({ ...context.paragraph, children });
  }

  const scale = Math.min(1, maxWidthPx / size.width);
  return new Paragraph({
    ...context.paragraph,
    children: [
      new ImageRun({
        type,
        data: decoded.bytes,
        transformation: {
          width: Math.round(size.width * scale),
          height: Math.round(size.height * scale),
        },
        altText: { name: alt, title: alt, description: alt },
      }),
    ],
  });
}

function tableBlock(node: JSONContent, convertBlocks: BlockConverter, widthTwips: number): Table {
  const rows = node.content ?? [];
  const columnCount = (rows[0]?.content ?? []).reduce(
    (total, cell) => total + Number(cell.attrs?.colspan ?? 1),
    0,
  );
  const columnWidth = Math.floor(widthTwips / Math.max(columnCount, 1));

  return new Table({
    width: { size: widthTwips, type: WidthType.DXA },
    columnWidths: Array.from({ length: columnCount }, () => columnWidth),
    rows: rows.map((row) => {
      const cells = row.content ?? [];
      return new TableRow({
        tableHeader: cells.length > 0 && cells.every((c) => c.type === 'tableHeader'),
        children: cells.map((cell) => {
          const columnSpan = Number(cell.attrs?.colspan ?? 1);
          return new TableCell({
            columnSpan,
            rowSpan: Number(cell.attrs?.rowspan ?? 1),
            width: { size: columnWidth * columnSpan, type: WidthType.DXA },
            children: convertBlocks(cell.content ?? [], { listLevel: -1, paragraph: {} }),
          });
        }),
      });
    }),
  });
}

type BlockConverter = (nodes: JSONContent[], context: BlockContext) => Block[];

function createBlockConverter(setup: PageSetup): BlockConverter {
  const contentWidth = contentWidthInches(setup);

  // Each numbered list gets its own instance, so its numbering restarts at 1.
  let nextListInstance = 0;

  function listBlocks(list: JSONContent, context: BlockContext): Block[] {
    const level = Math.min(context.listLevel + 1, MAX_LIST_LEVEL);
    const marker: IParagraphOptions =
      list.type === 'orderedList'
        ? { numbering: { reference: ORDERED_LIST, level, instance: nextListInstance++ } }
        : { bullet: { level } };
    const continuation: BlockContext = {
      listLevel: level,
      paragraph: { indent: { left: LIST_INDENT_TWIPS * (level + 1) } },
    };

    return (list.content ?? []).flatMap((item) =>
      (item.content ?? []).flatMap((child, index) =>
        index === 0 && child.type === 'paragraph'
          ? convert([child], { listLevel: level, paragraph: marker })
          : convert([child], continuation),
      ),
    );
  }

  function convert(nodes: JSONContent[], context: BlockContext): Block[] {
    return nodes.flatMap((node): Block[] => {
      switch (node.type) {
        case 'paragraph':
          return [
            new Paragraph({
              ...blockFormat(node, context),
              children: inlineChildren(node.content),
            }),
          ];
        case 'heading':
          return [
            new Paragraph({
              ...blockFormat(node, context),
              heading: HEADINGS[Number(node.attrs?.level ?? 1) - 1],
              children: inlineChildren(node.content),
            }),
          ];
        case 'bulletList':
        case 'orderedList':
          return listBlocks(node, context);
        case 'blockquote':
          return convert(node.content ?? [], {
            ...context,
            paragraph: { ...context.paragraph, style: 'Quote' },
          });
        case 'codeBlock':
          return (node.content?.[0]?.text ?? '').split('\n').map(
            (line) =>
              new Paragraph({
                ...context.paragraph,
                style: 'CodeBlock',
                children: [new TextRun({ text: line })],
              }),
          );
        case 'horizontalRule':
          return [new Paragraph({ ...context.paragraph, style: 'Divider' })];
        case 'image':
          return [imageParagraph(node, context, contentWidth * PX_PER_INCH)];
        case 'table':
          return [tableBlock(node, convert, twips(contentWidth))];
        case 'pageBreak':
          return [new Paragraph({ children: [new PageBreak()] })];
        default:
          return [];
      }
    });
  }

  return convert;
}

function orderedListLevels() {
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  return Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
    level,
    format: formats[level % formats.length]!,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: LIST_INDENT_TWIPS * (level + 1), hanging: LIST_INDENT_TWIPS },
      },
    },
  }));
}

/** One line: the text on the left and, if wanted, the page number on the right. */
function zoneParagraph(setup: PageSetup, text: string, withNumber: boolean): Paragraph | undefined {
  if (!text && !withNumber) return undefined;
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: twips(contentWidthInches(setup)) }],
    children: [
      new TextRun({ text, size: 18 }),
      ...(withNumber ? [new TextRun({ children: ['\t', PageNumber.CURRENT], size: 18 })] : []),
    ],
  });
}

function sectionOptions(setup: PageSetup) {
  const header = zoneParagraph(setup, setup.headerText, setup.pageNumbers === 'header');
  const footer = zoneParagraph(setup, setup.footerText, setup.pageNumbers === 'footer');
  const landscape = isLandscape(setup);
  return {
    properties: {
      page: {
        // Given as portrait: the library swaps them for landscape.
        size: {
          width: twips(Math.min(setup.widthIn, setup.heightIn)),
          height: twips(Math.max(setup.widthIn, setup.heightIn)),
          orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: {
          top: twips(setup.marginTopIn),
          bottom: twips(setup.marginBottomIn),
          left: twips(setup.marginLeftIn),
          right: twips(setup.marginRightIn),
          // Matches where the sheets show them on screen.
          header: twips(setup.marginTopIn * 0.4),
          footer: twips(setup.marginBottomIn * 0.4),
        },
      },
    },
    ...(header ? { headers: { default: new Header({ children: [header] }) } } : {}),
    ...(footer ? { footers: { default: new Footer({ children: [footer] }) } } : {}),
  };
}

/** Converts a FreeWrite document to a .docx file. */
export async function exportDocx(doc: JSONContent, title?: string): Promise<Blob> {
  const setup = readPageSetup(doc.attrs?.pageSetup);
  const convert = createBlockConverter(setup);
  const children = convert(doc.content ?? [], { listLevel: -1, paragraph: {} });

  const file = new Document({
    title,
    creator: 'Free 360',
    numbering: { config: [{ reference: ORDERED_LIST, levels: orderedListLevels() }] },
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22 },
          paragraph: {
            spacing: {
              after: DEFAULT_PARAGRAPH_GAP_TWIPS,
              line: Math.round(DEFAULT_LINE_SPACING * SINGLE_LINE),
            },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Quote',
          name: QUOTE_STYLE,
          basedOn: 'Normal',
          run: { italics: true },
          paragraph: { indent: { left: 720 } },
        },
        {
          id: 'CodeBlock',
          name: CODE_BLOCK_STYLE,
          basedOn: 'Normal',
          run: { font: 'Courier New' },
        },
        {
          id: 'Divider',
          name: DIVIDER_STYLE,
          basedOn: 'Normal',
          paragraph: {
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: '999999' } },
          },
        },
      ],
      characterStyles: [
        { id: 'InlineCode', name: INLINE_CODE_STYLE, run: { font: 'Courier New' } },
      ],
    },
    sections: [
      { ...sectionOptions(setup), children: children.length ? children : [new Paragraph({})] },
    ],
  });

  return Packer.toBlob(file);
}
