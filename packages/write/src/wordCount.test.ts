import { expect, it } from 'vitest';
import { countWords } from './wordCount';

it('counts words separated by any whitespace', () => {
  expect(countWords('')).toBe(0);
  expect(countWords('   ')).toBe(0);
  expect(countWords('one')).toBe(1);
  expect(countWords(' one  two\nthree\tfour ')).toBe(4);
});
