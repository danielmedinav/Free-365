import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';
import { readImageSize } from './imageSize';
import { CODE_BLOCK_STYLE, DIVIDER_STYLE, INLINE_CODE_STYLE, QUOTE_STYLE } from './styleNames';

const ORDERED_LIST = 'fs-ordered';
const MAX_LIST_LEVEL = 8;
/** Width between one-inch margins on a US Letter page. */
const TEXT_WIDTH_TWIPS = 9360;
const TEXT_WIDTH_PIXELS = 624;
const LIST_INDENT_TWIPS = 360;

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
  const run = new TextRun({
    text: node.text ?? '',
    bold: has('bold'),
    italics: has('italic'),
    strike: has('strike'),
    underline: has('underline') ? {} : undefined,
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

function imageParagraph(node: JSONContent, context: BlockContext): Paragraph {
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

  const scale = Math.min(1, TEXT_WIDTH_PIXELS / size.width);
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

function tableBlock(node: JSONContent, convertBlocks: BlockConverter): Table {
  const rows = node.content ?? [];
  const columnCount = (rows[0]?.content ?? []).reduce(
    (total, cell) => total + Number(cell.attrs?.colspan ?? 1),
    0,
  );
  const columnWidth = Math.floor(TEXT_WIDTH_TWIPS / Math.max(columnCount, 1));

  return new Table({
    width: { size: TEXT_WIDTH_TWIPS, type: WidthType.DXA },
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

function createBlockConverter(): BlockConverter {
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
      const alignment = ALIGNMENTS[String(node.attrs?.textAlign)];
      switch (node.type) {
        case 'paragraph':
          return [
            new Paragraph({
              ...context.paragraph,
              alignment,
              children: inlineChildren(node.content),
            }),
          ];
        case 'heading':
          return [
            new Paragraph({
              ...context.paragraph,
              alignment,
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
          return [imageParagraph(node, context)];
        case 'table':
          return [tableBlock(node, convert)];
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

/** Converts a FreeWrite document to a .docx file. */
export async function exportDocx(doc: JSONContent, title?: string): Promise<Blob> {
  const convert = createBlockConverter();
  const children = convert(doc.content ?? [], { listLevel: -1, paragraph: {} });

  const file = new Document({
    title,
    creator: 'Free 360',
    numbering: { config: [{ reference: ORDERED_LIST, levels: orderedListLevels() }] },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
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
    sections: [{ children: children.length ? children : [new Paragraph({})] }],
  });

  return Packer.toBlob(file);
}
