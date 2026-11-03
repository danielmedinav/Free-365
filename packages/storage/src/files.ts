// Minimal typings for the File System Access API (Chromium only; not in lib.dom yet).
type FilePickerType = { description?: string; accept: Record<string, string[]> };
type WritableFileStream = { write(data: Blob): Promise<void>; close(): Promise<void> };
type SaveFileHandle = { createWritable(): Promise<WritableFileStream> };
type OpenFileHandle = { getFile(): Promise<File> };
type FileAccessWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: FilePickerType[];
  }) => Promise<SaveFileHandle>;
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types?: FilePickerType[];
  }) => Promise<OpenFileHandle[]>;
};

export type FileTypeOption = {
  description: string;
  mimeType: string;
  extensions: string[];
};

const RESERVED = /[<>:"/\\|?*]/g;

/** Turns a document title into a safe file name, e.g. `Q3: Plan` + `docx` -> `Q3- Plan.docx`. */
export function toFileName(title: string, extension: string): string {
  const base = title
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(RESERVED, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return `${base || 'Untitled'}.${extension.replace(/^\./, '')}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Triggers a browser download of `blob`. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves with the native "Save as" dialog where supported, else downloads.
 * Returns false if the user cancelled.
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
  type?: FileTypeOption,
): Promise<boolean> {
  const picker = (window as FileAccessWindow).showSaveFilePicker;
  if (!picker) {
    downloadBlob(blob, fileName);
    return true;
  }
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: type
        ? [{ description: type.description, accept: { [type.mimeType]: type.extensions } }]
        : undefined,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    if (isAbortError(error)) return false;
    throw error;
  }
}

/** Opens the file picker and resolves with the chosen files (empty if cancelled). */
export async function pickFiles(types: FileTypeOption[], multiple = false): Promise<File[]> {
  const picker = (window as FileAccessWindow).showOpenFilePicker;
  if (picker) {
    try {
      const handles = await picker({
        multiple,
        types: types.map((t) => ({
          description: t.description,
          accept: { [t.mimeType]: t.extensions },
        })),
      });
      return Promise.all(handles.map((h) => h.getFile()));
    } catch (error) {
      if (isAbortError(error)) return [];
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = types.flatMap((t) => [t.mimeType, ...t.extensions]).join(',');
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
