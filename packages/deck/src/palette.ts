export type NamedColor = { name: string; hex: string };

/** Offered for text, shapes, and backgrounds alike, so it has light and dark choices. */
export const COLORS: NamedColor[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Gray', hex: '#666666' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Orange', hex: '#ef6c00' },
  { name: 'Gold', hex: '#f9a825' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Teal', hex: '#00796b' },
  { name: 'Blue', hex: '#1565c0' },
  { name: 'Navy', hex: '#14213d' },
  { name: 'Purple', hex: '#7b1fa2' },
  { name: 'Pink', hex: '#c2185b' },
];

/** Safe to use in a command id. */
export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
