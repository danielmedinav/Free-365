import { Image } from '@tiptap/extension-image';
import { ImageNodeView } from './ImageNodeView';

export type ImageLayout = 'left' | 'center' | 'right' | 'wrap-left' | 'wrap-right';

/** `wrap-left` means the image sits on the left, with text flowing down its right side. */
export const IMAGE_LAYOUTS: { value: ImageLayout; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'wrap-left', label: 'Left, text wraps' },
  { value: 'wrap-right', label: 'Right, text wraps' },
];

export const MIN_IMAGE_WIDTH = 24;

export function readImageLayout(value: unknown): ImageLayout {
  return IMAGE_LAYOUTS.find((layout) => layout.value === value)?.value ?? 'left';
}

function parseWidth(element: HTMLElement): number | null {
  const width = Number(element.getAttribute('width'));
  return width > 0 ? width : null;
}

/** An image with a width, a position on the page, and a handle to drag it larger or smaller. */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: parseWidth,
      },
      layout: {
        default: 'left',
        parseHTML: (element) => readImageLayout(element.getAttribute('data-layout')),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.layout === 'left' ? {} : { 'data-layout': attributes.layout },
      },
    };
  },

  addNodeView() {
    return ({ node, view, getPos }) => new ImageNodeView(node, view, getPos);
  },
});
