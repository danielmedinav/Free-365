import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LeaderType,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';
import { INDENT_STEP_INCHES, primaryFont, toHexColor, toPoints } from '../formatting';
import { isLandscape, PX_PER_INCH, readPageSetup, type PageSetup } from '../pageSetup';
import { readImageLayout, type ImageLayout } from '../imageExtension';
import { tableColumnWidths } from '../tableFormat';
import { readImageSize } from './imageSize';
import {
  CODE_BLOCK_STYLE,
  DIVIDER_STYLE,
  INLINE_CODE_STYLE,
  QUOTE_STYLE,
  TOC_HEADING_STYLE,
  tocStyleName,
} from './styleNames';

const ORDERED_LIST = 'fs-ordered';
const MAX_LIST_LEVEL = 8;
const LIST_INDENT_TWIPS = 360;
const TWIPS_PER_INCH = 1440;
const SINGLE_LINE = 240;
/** Matches the editor's default look, so documents keep their shape in other programs. */
const DEFAULT_LINE_SPACING = 1.15;
const DEFAULT_PARAGRAPH_GAP_TWIPS = 120;
const COLUMN_GAP_TWIPS = 720;
const TOC_LEVELS = 3;

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

function inlineChildren(
  nodes: JSONContent[] | undefined,
  addFootnote: (text: string) => number,
): ParagraphChild[] {
  return (nodes ?? []).map((node) => {
    if (node.type === 'hardBreak') return new TextRun({ break: 1 });
    if (node.type === 'footnote') {
      return new FootnoteReferenceRun(addFootnote(String(node.attrs?.text ?? '')));
    }
    return textRun(node);
  });
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

const IMAGE_ALIGNMENT: Partial<Record<ImageLayout, IParagraphOptions['alignment']>> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
};

const EMU_PER_PIXEL = 9525;

function isWrapped(node: JSONContent): boolean {
  return String(node.attrs?.layout).startsWith('wrap-');
}

function floatingOptions(layout: ImageLayout) {
  const onRight = layout === 'wrap-right';
  const gap = 12 * EMU_PER_PIXEL;
  return {
    horizontalPosition: {
      relative: HorizontalPositionRelativeFrom.MARGIN,
      align: onRight ? HorizontalPositionAlign.RIGHT : HorizontalPositionAlign.LEFT,
    },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
    wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
    margins: {
      top: 0,
      bottom: gap / 2,
      left: onRight ? gap : 0,
      right: onRight ? 0 : gap,
    },
  };
}

/** The run for an embeddable image, or undefined if this file format can't hold it. */
function imageRun(node: JSONContent, maxWidthPx: number): ParagraphChild | undefined {
  const decoded = decodeDataUrl(String(node.attrs?.src ?? ''));
  const type = decoded && IMAGE_TYPES[decoded.mimeType];
  const size = decoded && readImageSize(decoded.bytes);
  if (!decoded || !type || !size) return undefined;

  const alt = String(node.attrs?.alt ?? '');
  const layout = readImageLayout(node.attrs?.layout);
  const chosen = Number(node.attrs?.width) || size.width;
  const width = Math.min(chosen, maxWidthPx);
  return new ImageRun({
    type,
    data: decoded.bytes,
    transformation: {
      width: Math.round(width),
      height: Math.round((width / size.width) * size.height),
    },
    altText: { name: alt, title: alt, description: alt },
    ...(isWrapped(node) ? { floating: floatingOptions(layout) } : {}),
  });
}

function imageParagraph(node: JSONContent, context: BlockContext, maxWidthPx: number): Paragraph {
  const run = imageRun(node, maxWidthPx);
  if (run) {
    return new Paragraph({
      ...context.paragraph,
      alignment: IMAGE_ALIGNMENT[readImageLayout(node.attrs?.layout)],
      children: [run],
    });
  }

  // Linked images and formats .docx can't embed: keep a visible trace instead of dropping them.
  const src = String(node.attrs?.src ?? '');
  const alt = String(node.attrs?.alt ?? '');
  const label = `[Image${alt ? `: ${alt}` : ''}]`;
  const children = src.startsWith('http')
    ? [new ExternalHyperlink({ link: src, children: [new TextRun({ text: label })] })]
    : [new TextRun({ text: label })];
  return new Paragraph({ ...context.paragraph, children });
}

function tableBlock(node: JSONContent, convertBlocks: BlockConverter, widthTwips: number): Table {
  const rows = node.content ?? [];
  const columnWidths = tableColumnWidths(
    (rows[0]?.content ?? []).map((cell) => ({
      colspan: Number(cell.attrs?.colspan ?? 1),
      colwidth: (cell.attrs?.colwidth as (number | null)[] | null | undefined) ?? null,
    })),
    widthTwips,
  );
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);

  // Which grid column each row's next cell starts in, allowing for cells merged from above.
  const occupied = columnWidths.map(() => 0);

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows: rows.map((row) => {
      const cells = row.content ?? [];
      let column = 0;
      const children = cells.map((cell) => {
        while ((occupied[column] ?? 0) > 0) column++;
        const columnSpan = Number(cell.attrs?.colspan ?? 1);
        const rowSpan = Number(cell.attrs?.rowspan ?? 1);
        const width = columnWidths
          .slice(column, column + columnSpan)
          .reduce((total, value) => total + value, 0);
        for (let i = column; i < column + columnSpan; i++) occupied[i] = rowSpan;
        column += columnSpan;
        const background = toHexColor(cell.attrs?.backgroundColor);
        return new TableCell({
          columnSpan,
          rowSpan,
          width: { size: width, type: WidthType.DXA },
          ...(background
            ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: background.slice(1) } }
            : {}),
          children: convertBlocks(cell.content ?? [], { listLevel: -1, paragraph: {} }),
        });
      });
      occupied.forEach((value, index) => {
        if (value > 0) occupied[index] = value - 1;
      });
      return new TableRow({
        // Left out unless true: readers can mistake an explicit "off" for "on".
        ...(cells.length > 0 && cells.every((c) => c.type === 'tableHeader')
          ? { tableHeader: true }
          : {}),
        children,
      });
    }),
  });
}

type BlockConverter = (nodes: JSONContent[], context: BlockContext) => Block[];

type ConverterExtras = {
  addFootnote: (text: string) => number;
  tableOfContents: () => Paragraph[];
};

function createBlockConverter(setup: PageSetup, extras: ConverterExtras): BlockConverter {
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
    const maxImageWidth = contentWidth * PX_PER_INCH;
    // A wrapped image belongs at the start of the next paragraph, so the text starts level with it.
    let waitingImages: ParagraphChild[] = [];

    return nodes.flatMap((node, index): Block[] => {
      switch (node.type) {
        case 'paragraph': {
          const images = waitingImages;
          waitingImages = [];
          return [
            new Paragraph({
              ...blockFormat(node, context),
              children: [...images, ...inlineChildren(node.content, extras.addFootnote)],
            }),
          ];
        }
        case 'heading':
          return [
            new Paragraph({
              ...blockFormat(node, context),
              heading: HEADINGS[Number(node.attrs?.level ?? 1) - 1],
              children: inlineChildren(node.content, extras.addFootnote),
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
        case 'image': {
          const run = isWrapped(node) ? imageRun(node, maxImageWidth) : undefined;
          if (run && nodes[index + 1]?.type === 'paragraph') {
            waitingImages.push(run);
            return [];
          }
          return [imageParagraph(node, context, maxImageWidth)];
        }
        case 'table':
          return [tableBlock(node, convert, twips(contentWidth))];
        case 'tableOfContents':
          return extras.tableOfContents();
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
      ...(withNumber ? [new TextRun({ children: [new Tab(), PageNumber.CURRENT], size: 18 })] : []),
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

function plainText(node: JSONContent): string {
  return node.text ?? (node.content ?? []).map(plainText).join('');
}

function headingsIn(node: JSONContent): JSONContent[] {
  if (node.type === 'heading') return plainText(node).trim() ? [node] : [];
  return (node.content ?? []).flatMap(headingsIn);
}

/**
 * Written out as ordinary text, rather than a field the reader has to update: every program then
 * shows it straight away. The numbers are the ones FreeWrite had when this was exported.
 */
function tableOfContentsParagraphs(
  doc: JSONContent,
  setup: PageSetup,
  pages: number[] | undefined,
): Paragraph[] {
  const position = twips(contentWidthInches(setup));
  return [
    new Paragraph({ style: 'TOCHeading', children: [new TextRun('Contents')] }),
    ...headingsIn(doc).map((heading, index) => {
      const level = Math.min(Number(heading.attrs?.level ?? 1), TOC_LEVELS);
      const page = pages?.[index];
      return new Paragraph({
        style: `TOC${level}`,
        tabStops: [{ type: TabStopType.RIGHT, position, leader: LeaderType.DOT }],
        children: [
          new TextRun(plainText(heading)),
          ...(page === undefined ? [] : [new TextRun({ children: [new Tab(), String(page)] })]),
        ],
      });
    }),
  ];
}

/** Converts a FreeWrite document to a .docx file. */
export async function exportDocx(
  doc: JSONContent,
  title?: string,
  headingPageNumbers?: number[],
): Promise<Blob> {
  const setup = readPageSetup(doc.attrs?.pageSetup);
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let footnoteCount = 0;
  const convert = createBlockConverter(setup, {
    addFootnote(text) {
      footnoteCount++;
      footnotes[footnoteCount] = { children: [new Paragraph(text)] };
      return footnoteCount;
    },
    tableOfContents: () => tableOfContentsParagraphs(doc, setup, headingPageNumbers),
  });

  // Each run of ordinary blocks or column section becomes a section of the file.
  const groups: { columns: number; blocks: JSONContent[] }[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'columnSection') {
      groups.push({ columns: Number(node.attrs?.count ?? 2), blocks: node.content ?? [] });
    } else if (groups[groups.length - 1]?.columns === 1) {
      groups[groups.length - 1]!.blocks.push(node);
    } else {
      groups.push({ columns: 1, blocks: [node] });
    }
  }
  if (!groups.length) groups.push({ columns: 1, blocks: [] });

  const sections = groups.map(({ columns, blocks }, index) => {
    const options = sectionOptions(setup);
    const children = convert(blocks, { listLevel: -1, paragraph: {} });
    return {
      ...options,
      properties: {
        ...options.properties,
        ...(index > 0 ? { type: SectionType.CONTINUOUS } : {}),
        ...(columns > 1
          ? { column: { count: columns, space: COLUMN_GAP_TWIPS, equalWidth: true } }
          : {}),
      },
      children: children.length ? children : [new Paragraph({})],
    };
  });

  const file = new Document({
    title,
    creator: 'Free 360',
    numbering: { config: [{ reference: ORDERED_LIST, levels: orderedListLevels() }] },
    footnotes,
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
          id: 'TOCHeading',
          name: TOC_HEADING_STYLE,
          basedOn: 'Normal',
          run: { bold: true, size: 30 },
        },
        ...Array.from({ length: TOC_LEVELS }, (_, index) => ({
          id: `TOC${index + 1}`,
          name: tocStyleName(index + 1),
          basedOn: 'Normal',
          paragraph: { indent: { left: index * 240 } },
        })),
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
    sections,
  });

  return Packer.toBlob(file);
}
