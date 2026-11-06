import { getSchema, type JSONContent } from '@tiptap/core';
import { Node as PmNode } from '@tiptap/pm/model';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LineRuleType,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { writeExtensions } from '../extensions';
import { primaryFont, toHexColor } from '../formatting';
import { DEFAULT_PAGE_SETUP, readPageSetup } from '../pageSetup';
import { exportDocx } from './exportDocx';
import { readImageSize } from './imageSize';
import { importDocx } from './importDocx';

// A 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_SRC = `data:image/png;base64,${PNG_BASE64}`;

const text = (value: string, ...marks: string[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const item = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });

async function roundTrip(input: JSONContent): Promise<JSONContent> {
  const blob = await exportDocx(input, 'Test');
  return importDocx(await blob.arrayBuffer());
}

function blocks(result: JSONContent): JSONContent[] {
  return result.content ?? [];
}

describe('.docx round trip', () => {
  it('produces a document the editor schema accepts', async () => {
    const result = await roundTrip(
      doc({ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }, para(text('Body')), {
        type: 'bulletList',
        content: [item(para(text('a')))],
      }),
    );
    expect(() => PmNode.fromJSON(getSchema(writeExtensions), result).check()).not.toThrow();
  });

  it('keeps headings at each level', async () => {
    const result = await roundTrip(
      doc(
        ...[1, 2, 3, 4, 5, 6].map((level) => ({
          type: 'heading',
          attrs: { level },
          content: [text(`H${level}`)],
        })),
      ),
    );
    expect(blocks(result).map((b) => [b.type, b.attrs?.level, b.content?.[0]?.text])).toEqual(
      [1, 2, 3, 4, 5, 6].map((level) => ['heading', level, `H${level}`]),
    );
  });

  it('keeps bold, italic, underline, strikethrough, and inline code', async () => {
    const result = await roundTrip(
      doc(
        para(
          text('plain '),
          text('bold', 'bold'),
          text(' '),
          text('italic', 'italic'),
          text(' '),
          text('under', 'underline'),
          text(' '),
          text('strike', 'strike'),
          text(' '),
          text('code', 'code'),
        ),
      ),
    );
    const runs = blocks(result)[0]?.content ?? [];
    const marksOf = (value: string) =>
      runs.find((r) => r.text === value)?.marks?.map((m) => m.type);
    expect(marksOf('bold')).toEqual(['bold']);
    expect(marksOf('italic')).toEqual(['italic']);
    expect(marksOf('under')).toEqual(['underline']);
    expect(marksOf('strike')).toEqual(['strike']);
    expect(marksOf('code')).toEqual(['code']);
    expect(marksOf('plain ')).toBeUndefined();
  });

  it('keeps combined marks', async () => {
    const result = await roundTrip(doc(para(text('both', 'bold', 'italic'))));
    const marks = blocks(result)[0]?.content?.[0]?.marks?.map((m) => m.type);
    expect(marks).toEqual(expect.arrayContaining(['bold', 'italic']));
  });

  it('keeps alignment on paragraphs and headings', async () => {
    const aligned = (textAlign: string) => ({
      type: 'paragraph',
      attrs: { textAlign },
      content: [text(textAlign)],
    });
    const result = await roundTrip(
      doc(
        aligned('center'),
        aligned('right'),
        aligned('justify'),
        { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('head')] },
        para(text('default')),
      ),
    );
    expect(blocks(result).map((b) => [b.type, b.attrs?.textAlign])).toEqual([
      ['paragraph', 'center'],
      ['paragraph', 'right'],
      ['paragraph', 'justify'],
      ['heading', 'center'],
      ['paragraph', null],
    ]);
    expect(blocks(result)[3]?.attrs?.level).toBe(2);
  });

  it('keeps bulleted, numbered, and nested lists', async () => {
    const result = await roundTrip(
      doc(
        {
          type: 'bulletList',
          content: [
            item(para(text('one')), {
              type: 'bulletList',
              content: [item(para(text('nested')))],
            }),
            item(para(text('two'))),
          ],
        },
        para(text('between')),
        { type: 'orderedList', content: [item(para(text('first'))), item(para(text('second')))] },
      ),
    );
    const [bullets, between, numbered] = blocks(result);
    expect(bullets?.type).toBe('bulletList');
    expect(bullets?.content).toHaveLength(2);
    expect(bullets?.content?.[0]?.content?.[1]?.type).toBe('bulletList');
    expect(between?.type).toBe('paragraph');
    expect(numbered?.type).toBe('orderedList');
    expect(numbered?.content).toHaveLength(2);
  });

  it('keeps tables, header rows, and merged cells', async () => {
    const cell = (type: string, value: string, attrs: object = {}): JSONContent => ({
      type,
      attrs: { colspan: 1, rowspan: 1, ...attrs },
      content: [para(text(value))],
    });
    const result = await roundTrip(
      doc({
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
          { type: 'tableRow', content: [cell('tableCell', 'wide', { colspan: 2 })] },
          { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2')] },
        ],
      }),
    );
    const rows = blocks(result)[0]?.content ?? [];
    expect(blocks(result)[0]?.type).toBe('table');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.content?.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
    expect(rows[1]?.content?.[0]?.attrs?.colspan).toBe(2);
    expect(rows[2]?.content?.[1]?.content?.[0]?.content?.[0]?.text).toBe('2');
  });

  it('keeps embedded images and their alt text', async () => {
    const result = await roundTrip(
      doc({ type: 'image', attrs: { src: PNG_SRC, alt: 'A dot' } }, para(text('after'))),
    );
    const image = JSON.stringify(result);
    expect(image).toContain('"type":"image"');
    expect(image).toContain(PNG_BASE64);
    expect(image).toContain('A dot');
  });

  it('keeps links, line breaks, blockquotes, code blocks, dividers, and empty lines', async () => {
    const result = await roundTrip(
      doc(
        para({
          type: 'text',
          text: 'site',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
        }),
        para(text('line one'), { type: 'hardBreak' }, text('line two')),
        { type: 'blockquote', content: [para(text('quoted'))] },
        { type: 'codeBlock', content: [text('const a = 1;\nconst b = 2;')] },
        { type: 'horizontalRule' },
        { type: 'paragraph' },
        para(text('end')),
      ),
    );
    const [link, lines, quote, code, divider, empty, end] = blocks(result);
    expect(link?.content?.[0]?.marks?.[0]?.attrs?.href).toBe('https://example.com/');
    expect(lines?.content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(quote?.type).toBe('blockquote');
    expect(code?.type).toBe('codeBlock');
    expect(code?.content?.[0]?.text).toBe('const a = 1;\nconst b = 2;');
    expect(divider?.type).toBe('horizontalRule');
    expect(empty?.type).toBe('paragraph');
    expect(empty?.content).toBeUndefined();
    expect(end?.content?.[0]?.text).toBe('end');
  });

  it('keeps fonts, sizes, text colors, and highlights', async () => {
    const styled = (value: string, attrs: object): JSONContent => ({
      type: 'text',
      text: value,
      marks: [{ type: 'textStyle', attrs }],
    });
    const result = await roundTrip(
      doc(
        para(
          text('plain '),
          styled('font', { fontFamily: 'Times New Roman' }),
          text(' '),
          styled('size', { fontSize: '18pt' }),
          text(' '),
          styled('color', { color: '#c62828' }),
          text(' '),
          styled('mark', { backgroundColor: '#fff176' }),
          text(' '),
          styled('all', { fontFamily: 'Georgia', fontSize: '9pt', color: '#1565c0' }),
        ),
      ),
    );
    const runs = blocks(result)[0]?.content ?? [];
    const attrs = (value: string) =>
      runs.find((r) => r.text === value)?.marks?.find((m) => m.type === 'textStyle')?.attrs;

    expect(primaryFont(attrs('font')?.fontFamily)).toBe('Times New Roman');
    expect(attrs('size')?.fontSize).toBe('18pt');
    expect(toHexColor(attrs('color')?.color)).toBe('#c62828');
    expect(toHexColor(attrs('mark')?.backgroundColor)).toBe('#fff176');
    expect(primaryFont(attrs('all')?.fontFamily)).toBe('Georgia');
    expect(attrs('all')?.fontSize).toBe('9pt');
    expect(toHexColor(attrs('all')?.color)).toBe('#1565c0');
    expect(attrs('plain ')).toBeUndefined();
  });

  it('keeps superscript and subscript', async () => {
    const result = await roundTrip(
      doc(para(text('E=mc'), text('2', 'superscript'), text(' H'), text('2', 'subscript'))),
    );
    const marks = (blocks(result)[0]?.content ?? []).map((r) => r.marks?.[0]?.type);
    expect(marks).toEqual([undefined, 'superscript', undefined, 'subscript']);
  });

  it('keeps line spacing and indents', async () => {
    const result = await roundTrip(
      doc(
        { type: 'paragraph', attrs: { lineSpacing: 2 }, content: [text('double')] },
        { type: 'paragraph', attrs: { lineSpacing: 1.15 }, content: [text('tight')] },
        { type: 'paragraph', attrs: { indent: 3 }, content: [text('indented')] },
        { type: 'heading', attrs: { level: 2, lineSpacing: 1.5 }, content: [text('head')] },
        para(text('plain')),
      ),
    );
    expect(blocks(result).map((b) => [b.attrs?.lineSpacing, b.attrs?.indent])).toEqual([
      [2, 0],
      [1.15, 0],
      [null, 3],
      [1.5, 0],
      [null, 0],
    ]);
  });

  it('keeps formatting inside links, bold text, and tables', async () => {
    const color = { type: 'textStyle', attrs: { color: '#c62828' } };
    const result = await roundTrip(
      doc(
        para({
          type: 'text',
          text: 'site',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }, color],
        }),
        para({ type: 'text', text: 'loud', marks: [{ type: 'bold' }, color] }),
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [para({ type: 'text', text: 'cell', marks: [color] })],
                },
              ],
            },
          ],
        },
      ),
    );
    expect(JSON.stringify(result)).toContain('https://example.com/');
    const find = (node: JSONContent, value: string): JSONContent | undefined =>
      node.text === value ? node : node.content?.map((c) => find(c, value)).find(Boolean);
    for (const value of ['site', 'loud', 'cell']) {
      const style = find(result, value)?.marks?.find((m) => m.type === 'textStyle');
      expect(toHexColor(style?.attrs?.color)).toBe('#c62828');
    }
    expect(find(result, 'loud')?.marks?.map((m) => m.type)).toContain('bold');
  });

  it('leaves no marker characters behind, even in empty paragraphs', async () => {
    const result = await roundTrip(
      doc(
        { type: 'paragraph', attrs: { textAlign: 'center' } },
        { type: 'paragraph', attrs: { lineSpacing: 2 }, content: [text('x')] },
      ),
    );
    expect(JSON.stringify(result)).not.toMatch(/[-]/);
    expect(blocks(result)[0]?.attrs?.textAlign).toBe('center');
    expect(blocks(result)[0]?.content).toBeUndefined();
  });

  it('keeps paper size, orientation, margins, header, footer, and page numbers', async () => {
    const pageSetup = {
      widthIn: 11.69,
      heightIn: 8.27,
      marginTopIn: 0.5,
      marginBottomIn: 0.75,
      marginLeftIn: 1.25,
      marginRightIn: 2,
      headerText: 'Annual report',
      footerText: 'Confidential',
      pageNumbers: 'footer',
    };
    const result = await roundTrip({ ...doc(para(text('x'))), attrs: { pageSetup } });
    const read = readPageSetup(result.attrs?.pageSetup);
    expect(read.widthIn).toBeCloseTo(11.69);
    expect(read.heightIn).toBeCloseTo(8.27);
    expect(read.marginTopIn).toBeCloseTo(0.5);
    expect(read.marginBottomIn).toBeCloseTo(0.75);
    expect(read.marginLeftIn).toBeCloseTo(1.25);
    expect(read.marginRightIn).toBeCloseTo(2);
    expect(read.headerText).toBe('Annual report');
    expect(read.footerText).toBe('Confidential');
    expect(read.pageNumbers).toBe('footer');
  });

  it('keeps page numbers in the header, with or without text', async () => {
    const pageSetup = { pageNumbers: 'header' };
    const result = await roundTrip({ ...doc(para(text('x'))), attrs: { pageSetup } });
    const read = readPageSetup(result.attrs?.pageSetup);
    expect(read.pageNumbers).toBe('header');
    expect(read.headerText).toBe('');
  });

  it('uses the defaults when a document has no page setup', async () => {
    const result = await roundTrip(doc(para(text('x'))));
    expect(readPageSetup(result.attrs?.pageSetup)).toEqual(DEFAULT_PAGE_SETUP);
  });

  it('keeps page breaks without adding empty paragraphs', async () => {
    const result = await roundTrip(
      doc(para(text('before')), { type: 'pageBreak' }, para(text('after'))),
    );
    expect(blocks(result).map((b) => b.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
  });

  it('fits tables and images to the width between the margins', async () => {
    const pageSetup = { widthIn: 8.5, marginLeftIn: 2, marginRightIn: 2 };
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para(text('a'))] },
          ],
        },
      ],
    };
    const blob = await exportDocx({ ...doc(table), attrs: { pageSetup } }, 'Test');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(xml).toContain('w:w="6480"'); // 4.5 inches
  });

  it('handles an empty document', async () => {
    const result = await roundTrip(doc());
    expect(result.type).toBe('doc');
  });
});

describe('importDocx', () => {
  it('strips links with dangerous protocols', async () => {
    const result = await roundTrip(
      doc(
        para({
          type: 'text',
          text: 'click',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }),
      ),
    );
    expect(JSON.stringify(result)).not.toContain('javascript:');
    expect(blocks(result)[0]?.content?.[0]?.text).toBe('click');
  });

  it('rejects files that are not .docx', async () => {
    const notADocx = new TextEncoder().encode('just some text').buffer as ArrayBuffer;
    await expect(importDocx(notADocx)).rejects.toThrow();
  });
});

describe('exportDocx', () => {
  it('keeps a visible placeholder for images it cannot embed', async () => {
    const result = await roundTrip(
      doc({ type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'Remote' } }),
    );
    expect(JSON.stringify(result)).toContain('[Image: Remote]');
  });
});

describe('readImageSize', () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);

  it('reads PNG dimensions', () => {
    const png = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
    expect(readImageSize(png)).toEqual({ width: 1, height: 1 });
  });

  it('reads GIF dimensions', () => {
    expect(readImageSize(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0))).toEqual({
      width: 3,
      height: 2,
    });
  });

  it('reads JPEG dimensions, skipping earlier segments', () => {
    const jpeg = bytes(
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00, // APP0 with 2 bytes of data
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x00,
      0x20,
      0x00,
      0x40,
      0x03,
      0x00,
      0x00,
    );
    expect(readImageSize(jpeg)).toEqual({ width: 64, height: 32 });
  });

  it('returns undefined for unknown or truncated data', () => {
    expect(readImageSize(bytes(1, 2, 3))).toBeUndefined();
    expect(readImageSize(bytes(0x89, 0x50, 0x4e, 0x47))).toBeUndefined();
  });
});

describe('importDocx with files from other programs', () => {
  async function fromParagraphs(children: Paragraph[]): Promise<JSONContent> {
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    return importDocx(await blob.arrayBuffer());
  }

  it('reads named highlight colors', async () => {
    const result = await fromParagraphs([
      new Paragraph({ children: [new TextRun({ text: 'lit', highlight: 'yellow' })] }),
    ]);
    const style = blocks(result)[0]?.content?.[0]?.marks?.[0];
    expect(toHexColor(style?.attrs?.backgroundColor)).toBe('#ffff00');
  });

  it('ignores automatic colors and fixed line heights', async () => {
    const result = await fromParagraphs([
      new Paragraph({
        spacing: { line: 300, lineRule: LineRuleType.EXACT },
        children: [new TextRun({ text: 'a', color: 'auto' })],
      }),
    ]);
    expect(blocks(result)[0]?.attrs?.lineSpacing).toBeNull();
    expect(blocks(result)[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it('keeps a centered title as a heading', async () => {
    const result = await fromParagraphs([
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun('Title')],
      }),
    ]);
    expect(blocks(result)[0]?.type).toBe('heading');
    expect(blocks(result)[0]?.attrs?.textAlign).toBe('center');
  });

  it('turns a paragraph set to start on a new page into a page break', async () => {
    const result = await fromParagraphs([
      new Paragraph('one'),
      new Paragraph({ pageBreakBefore: true, children: [new TextRun('two')] }),
    ]);
    expect(blocks(result).map((b) => b.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
  });

  it('keeps text around a page break in the middle of a paragraph', async () => {
    const result = await fromParagraphs([
      new Paragraph({ children: [new TextRun('one'), new PageBreak(), new TextRun('two')] }),
    ]);
    expect(blocks(result).map((b) => [b.type, b.content?.[0]?.text])).toEqual([
      ['paragraph', 'one'],
      ['pageBreak', undefined],
      ['paragraph', 'two'],
    ]);
  });

  it('keeps a font name with odd characters from breaking the document', async () => {
    const result = await fromParagraphs([
      new Paragraph({ children: [new TextRun({ text: 'odd', font: 'A"; color: red; x:"' })] }),
    ]);
    expect(blocks(result)[0]?.content?.[0]?.text).toBe('odd');
    expect(JSON.stringify(result)).not.toContain('color":"red');
  });
});
