export type NamedColor = { name: string; hex: string };

export const TEXT_COLORS: NamedColor[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Gray', hex: '#666666' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Orange', hex: '#ef6c00' },
  { name: 'Gold', hex: '#b28704' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Teal', hex: '#00796b' },
  { name: 'Blue', hex: '#1565c0' },
  { name: 'Indigo', hex: '#3949ab' },
  { name: 'Purple', hex: '#7b1fa2' },
  { name: 'Pink', hex: '#c2185b' },
  { name: 'Brown', hex: '#5d4037' },
];

export const HIGHLIGHT_COLORS: NamedColor[] = [
  { name: 'Yellow', hex: '#fff176' },
  { name: 'Lime', hex: '#ccff90' },
  { name: 'Green', hex: '#a5d6a7' },
  { name: 'Aqua', hex: '#80deea' },
  { name: 'Blue', hex: '#90caf9' },
  { name: 'Lavender', hex: '#ce93d8' },
  { name: 'Pink', hex: '#f48fb1' },
  { name: 'Orange', hex: '#ffcc80' },
  { name: 'Gray', hex: '#d9d9d9' },
];

/** Safe to use in a command id. */
export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
