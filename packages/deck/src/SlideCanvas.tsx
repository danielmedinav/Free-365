import type { Stage as KonvaStage } from 'konva/lib/Stage';
import type { Transformer as KonvaTransformer } from 'konva/lib/shapes/Transformer';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Layer, Stage, Transformer } from 'react-konva';
import {
  describeElement,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Slide,
  type SlideElement,
  type TextElement,
  type Theme,
} from './deck';
import styles from './SlideCanvas.module.css';
import { SlideContent, TEXT_LINE_HEIGHT } from './SlideContent';

const PADDING = 24;
const TEXT_ANCHORS = ['middle-left', 'middle-right'];

type SlideCanvasProps = {
  slide: Slide;
  theme: Theme;
  selectedId: string | null;
  editingId: string | null;
  areaRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string | null) => void;
  onEditText: (id: string) => void;
  onFinishText: (id: string, text: string) => void;
  onChange: (id: string, patch: Partial<SlideElement>, label: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

/** The slide being edited: click to select, drag to move, and drag the handles to resize or turn. */
export function SlideCanvas({
  slide,
  theme,
  selectedId,
  editingId,
  areaRef,
  onSelect,
  onEditText,
  onFinishText,
  onChange,
  onKeyDown,
}: SlideCanvasProps) {
  const stageRef = useRef<KonvaStage>(null);
  const transformerRef = useRef<KonvaTransformer>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const available = Math.min(
        (area.clientWidth - PADDING * 2) / SLIDE_WIDTH,
        (area.clientHeight - PADDING * 2) / SLIDE_HEIGHT,
      );
      setScale(Math.max(available, 0.1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [areaRef]);

  const selected = slide.elements.find((element) => element.id === selectedId);
  const isText = selected?.type === 'text';

  // Attaches the handles to the selected thing, redrawing when it changes.
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const node = selectedId && !editingId ? stage.findOne(`#${selectedId}`) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, editingId, slide]);

  const editing = slide.elements.find((element) => element.id === editingId) as
    TextElement | undefined;

  return (
    <div
      ref={areaRef}
      className={styles.area}
      tabIndex={0}
      role="application"
      aria-label="Slide editor"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        // A click outside the slide deselects, and the keyboard stays here.
        if (event.target === event.currentTarget) onSelect(null);
      }}
    >
      <div
        className={styles.slide}
        style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
      >
        <Stage
          ref={stageRef}
          width={SLIDE_WIDTH * scale}
          height={SLIDE_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(event) => {
            if (event.target.name() === 'slide-background') onSelect(null);
          }}
        >
          <Layer>
            <SlideContent
              slide={slide}
              theme={theme}
              showHints
              editingId={editingId}
              handlers={{ onSelect, onEditText, onChange }}
            />
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={selected?.type === 'image'}
              enabledAnchors={
                isText
                  ? TEXT_ANCHORS
                  : [
                      'top-left',
                      'top-center',
                      'top-right',
                      'middle-left',
                      'middle-right',
                      'bottom-left',
                      'bottom-center',
                      'bottom-right',
                    ]
              }
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 10 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
        {editing && (
          <TextOverlay
            key={editing.id}
            element={editing}
            theme={theme}
            scale={scale}
            onFinish={(text) => onFinishText(editing.id, text)}
          />
        )}
      </div>
      {/* A canvas is invisible to screen readers and the keyboard, so its contents are also here. */}
      <ul className="fs-visually-hidden" aria-label="Objects on this slide">
        {slide.elements.map((element) => (
          <li key={element.id}>
            <button
              type="button"
              aria-pressed={element.id === selectedId}
              data-element-x={element.x}
              data-element-y={element.y}
              data-element-width={element.width}
              data-element-height={element.height}
              data-element-rotation={element.rotation}
              onClick={() => onSelect(element.id)}
            >
              {describeElement(element)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TextOverlayProps = {
  element: TextElement;
  theme: Theme;
  scale: number;
  onFinish: (text: string) => void;
};

/** Text is typed in a real text box laid exactly over where it shows on the slide. */
function TextOverlay({ element, theme, scale, onFinish }: TextOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onFinish(ref.current?.value ?? element.text);
  };

  return (
    <textarea
      ref={ref}
      className={styles.overlay}
      aria-label="Slide text"
      defaultValue={element.text}
      style={{
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        minHeight: element.height * scale,
        transform: `rotate(${element.rotation}deg)`,
        fontSize: element.fontSize * scale,
        fontFamily: theme.fontFamily,
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? 'italic' : 'normal',
        textAlign: element.align,
        lineHeight: TEXT_LINE_HEIGHT,
        color: element.color ?? theme.text,
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          finish();
        }
      }}
    />
  );
}
