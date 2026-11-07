/** Named .docx styles written by export and recognized by import, so these survive a round trip. */
export const QUOTE_STYLE = 'Quote';
export const CODE_BLOCK_STYLE = 'Code Block';
export const DIVIDER_STYLE = 'Divider';
export const INLINE_CODE_STYLE = 'Inline Code';
/** The names other word processors use too, so their tables of contents are recognized. */
export const TOC_HEADING_STYLE = 'TOC Heading';
export const tocStyleName = (level: number) => `toc ${level}`;
