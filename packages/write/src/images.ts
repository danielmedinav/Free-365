import type { FileTypeOption } from '@free360/storage';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** These are also the formats .docx export can embed. */
export const IMAGE_FILE_TYPE: FileTypeOption = {
  description: 'Images',
  mimeType: 'image/png',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
};

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp'];

/** Images live inside the document, so a huge one slows every save. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    throw new ImageRejectedError(`“${file.name}” isn't a PNG, JPEG, GIF, or BMP image.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(`“${file.name}” is larger than 10 MB.`);
  }
  return readAsDataUrl(file);
}

export function imageFilesIn(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) => f.type.startsWith('image/'));
}

/** Inserts dropped or pasted images at the cursor, or at `pos` if given. */
export async function insertImageFiles(
  view: EditorView,
  files: File[],
  onError: (error: unknown) => void,
  pos?: number,
): Promise<void> {
  const { image } = view.state.schema.nodes;
  if (!image) return;
  for (const file of files) {
    try {
      const src = await imageFileToDataUrl(file);
      if (view.isDestroyed) return;
      const { tr } = view.state;
      if (pos !== undefined) {
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
      }
      view.dispatch(tr.replaceSelectionWith(image.create({ src, alt: file.name })));
    } catch (error) {
      onError(error);
    }
  }
}
