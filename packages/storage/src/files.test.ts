import { describe, expect, it } from 'vitest';
import { toFileName } from './files';

describe('toFileName', () => {
  it('appends the extension', () => {
    expect(toFileName('Report', 'docx')).toBe('Report.docx');
    expect(toFileName('Report', '.xlsx')).toBe('Report.xlsx');
  });

  it('replaces reserved characters and trims trailing dots', () => {
    expect(toFileName('Q3: Plan / v2?', 'pptx')).toBe('Q3- Plan - v2-.pptx');
    expect(toFileName('notes...', 'csv')).toBe('notes.csv');
  });

  it('falls back to Untitled', () => {
    expect(toFileName('   ', 'docx')).toBe('Untitled.docx');
  });
});
