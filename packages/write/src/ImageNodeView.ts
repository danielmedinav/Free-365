import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import { MIN_IMAGE_WIDTH, readImageLayout, type ImageLayout } from './imageExtension';

/** How far the image's width changes for each pixel the handle moves to the right. */
const DRAG_FACTOR: Record<ImageLayout, number> = {
  left: 1,
  'wrap-left': 1,
  // Centered images grow both ways, so the handle only covers half of the change.
  center: 2,
  right: -1,
  'wrap-right': -1,
};

/** Renders an image in its position on the page, with a resize handle while it's selected. */
export class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly handle: HTMLElement;
  private node: PmNode;

  constructor(
    node: PmNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'fs-image';
    this.image = document.createElement('img');
    this.image.draggable = false;
    this.handle = document.createElement('span');
    this.handle.className = 'fs-image-handle';
    this.handle.addEventListener('pointerdown', this.startDrag);
    this.dom.append(this.image, this.handle);
    this.render();
  }

  private render() {
    const { src, alt, title, width, layout } = this.node.attrs as Record<string, unknown>;
    this.dom.dataset.layout = readImageLayout(layout);
    this.image.src = String(src ?? '');
    this.image.alt = String(alt ?? '');
    if (title) this.image.title = String(title);
    this.image.style.width = typeof width === 'number' ? `${width}px` : '';
  }

  private readonly startDrag = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const { handle, image } = this;
    const startX = event.clientX;
    const startWidth = image.getBoundingClientRect().width;
    const factor = DRAG_FACTOR[readImageLayout(this.node.attrs.layout)];
    const widthAt = (x: number) =>
      Math.max(MIN_IMAGE_WIDTH, Math.round(startWidth + (x - startX) * factor));

    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      image.style.width = `${widthAt(move.clientX)}px`;
    };
    const onEnd = (end: PointerEvent) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      // Saved once at the end, so one drag is one undo step.
      const pos = this.getPos();
      if (pos === undefined || end.type === 'pointercancel') {
        this.render();
        return;
      }
      // Measured rather than computed: the page margins may have limited how wide it could get.
      const width = Math.round(image.getBoundingClientRect().width);
      this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, 'width', width));
      this.view.focus();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target === this.handle;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy() {
    this.handle.removeEventListener('pointerdown', this.startDrag);
  }
}
