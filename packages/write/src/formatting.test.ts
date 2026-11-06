import { describe, expect, it } from 'vitest';
import { normalizeLink, primaryFont, slug, toHexColor, toPoints } from './formatting';

describe('slug', () => {
  it('makes values safe for command ids', () => {
    expect(slug('Times New Roman')).toBe('times-new-roman');
    expect(slug(1.15)).toBe('1-15');
  });
});

describe('primaryFont', () => {
  it('takes the first family without quotes', () => {
    expect(primaryFont('Arial')).toBe('Arial');
    expect(primaryFont('"Times New Roman", serif')).toBe('Times New Roman');
    expect(primaryFont(undefined)).toBeUndefined();
    expect(primaryFont('')).toBeUndefined();
  });
});

describe('toHexColor', () => {
  it('reads the forms browsers produce', () => {
    expect(toHexColor('#FF0000')).toBe('#ff0000');
    expect(toHexColor('#f00')).toBe('#ff0000');
    expect(toHexColor('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(toHexColor('rgba(1, 2, 3, 0.5)')).toBe('#010203');
    expect(toHexColor('rgb(1 2 3)')).toBe('#010203');
  });

  it('rejects anything else', () => {
    expect(toHexColor('red')).toBeUndefined();
    expect(toHexColor(null)).toBeUndefined();
  });
});

describe('toPoints', () => {
  it('reads points and pixels', () => {
    expect(toPoints('12pt')).toBe(12);
    expect(toPoints('16px')).toBe(12);
    expect(toPoints('1em')).toBeUndefined();
    expect(toPoints(undefined)).toBeUndefined();
  });
});

describe('normalizeLink', () => {
  it('adds what people usually leave out', () => {
    expect(normalizeLink('example.com')).toBe('https://example.com');
    expect(normalizeLink('  example.com/a ')).toBe('https://example.com/a');
    expect(normalizeLink('me@example.com')).toBe('mailto:me@example.com');
  });

  it('keeps allowed schemes', () => {
    expect(normalizeLink('http://example.com')).toBe('http://example.com');
    expect(normalizeLink('tel:+15551234')).toBe('tel:+15551234');
  });

  it('refuses dangerous schemes and invalid input', () => {
    expect(normalizeLink('javascript:alert(1)')).toBeUndefined();
    expect(normalizeLink('JAVASCRIPT:alert(1)')).toBeUndefined();
    expect(normalizeLink('data:text/html,x')).toBeUndefined();
    expect(normalizeLink('two words')).toBeUndefined();
    expect(normalizeLink('   ')).toBeUndefined();
  });
});
