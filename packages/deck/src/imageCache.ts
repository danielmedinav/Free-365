const cache = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();

/** Loads an image once, however many thumbnails and canvases show it. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = cache.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => {
        loaded.set(src, image);
        resolve(image);
      };
      image.onerror = () => {
        cache.delete(src);
        reject(new Error('Could not load image'));
      };
      image.src = src;
    });
    cache.set(src, pending);
  }
  return pending;
}

/** The image if it has finished loading, so already-seen pictures draw straight away. */
export function loadedImage(src: string): HTMLImageElement | undefined {
  return loaded.get(src);
}
