import type { Context } from 'konva/lib/Context';
import type { KonvaEventObject, Node as KonvaNode } from 'konva/lib/Node';
import type { Shape as KonvaShape } from 'konva/lib/Shape';
import { useEffect, useState } from 'react';
import { Image as KonvaImage, Rect, Shape, Text } from 'react-konva';
import {
  PLACEHOLDER_HINTS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ImageElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TextElement,
  type Theme,
} from './deck';
import { loadedImage, loadImage } from './imageCache';

export const TEXT_LINE_HEIGHT = 1.2;

export type ElementHandlers = {
  onSelect: (id: string) => void;
  onEditText: (id: string) => void;
  onChange: (id: string, patch: Partial<SlideElement>, label: string) => void;
};

type SlideContentProps = {
  slide: Slide;
  theme: Theme;
  /** Empty text boxes show a hint while editing; when presenting they show nothing. */
  showHints?: boolean;
  /** Hidden while its text is being typed in the box laid over it. */
  editingId?: string | null;
  handlers?: ElementHandlers;
};

function drawShape(context: Context, shape: KonvaShape, kind: ShapeElement['shape']) {
  const width = shape.width();
  const height = shape.height();
  context.beginPath();
  switch (kind) {
    case 'ellipse':
      context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      context.moveTo(width / 2, 0);
      context.lineTo(width, height);
      context.lineTo(0, height);
      break;
    case 'arrow': {
      const neck = width * 0.6;
      context.moveTo(0, height * 0.3);
      context.lineTo(neck, height * 0.3);
      context.lineTo(neck, 0);
      context.lineTo(width, height / 2);
      context.lineTo(neck, height);
      context.lineTo(neck, height * 0.7);
      context.lineTo(0, height * 0.7);
      break;
    }
    default:
      context.rect(0, 0, width, height);
  }
  context.closePath();
  context.fillStrokeShape(shape);
}

function SlideImage({
  element,
  common,
}: {
  element: ImageElement;
  common: Record<string, unknown>;
}) {
  const [image, setImage] = useState(() => loadedImage(element.src));

  useEffect(() => {
    let cancelled = false;
    void loadImage(element.src)
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [element.src]);

  return <KonvaImage {...common} image={image} />;
}

function shownText(element: TextElement): string {
  if (!element.bullets) return element.text;
  return element.text
    .split('\n')
    .map((line) => (line.trim() ? `•  ${line}` : line))
    .join('\n');
}

/**
 * Draws one slide. The same drawing is used for the editor, thumbnails, presenting, and PDF export,
 * so they can't disagree.
 */
export function SlideContent({ slide, theme, showHints, editingId, handlers }: SlideContentProps) {
  const commonFor = (element: SlideElement) => {
    if (!handlers) return { x: element.x, y: element.y, rotation: element.rotation };
    return {
      id: element.id,
      name: 'slide-element',
      x: element.x,
      y: element.y,
      rotation: element.rotation,
      draggable: true,
      onMouseDown: () => handlers.onSelect(element.id),
      onTap: () => handlers.onSelect(element.id),
      onDragEnd: (event: KonvaEventObject<DragEvent>) => {
        handlers.onChange(element.id, { x: event.target.x(), y: event.target.y() }, 'Move');
      },
      onTransformEnd: (event: KonvaEventObject<Event>) => {
        const node: KonvaNode = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        // Sizes are stored, not scales, so text and outlines don't get stretched.
        node.scaleX(1);
        node.scaleY(1);
        const patch: Partial<SlideElement> = {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(16, Math.round(element.width * scaleX)),
        };
        if (element.type !== 'text') {
          patch.height = Math.max(
            element.type === 'shape' ? 2 : 16,
            Math.round(element.height * scaleY),
          );
        }
        handlers.onChange(element.id, patch, 'Resize');
      },
    };
  };

  return (
    <>
      <Rect
        name="slide-background"
        width={SLIDE_WIDTH}
        height={SLIDE_HEIGHT}
        fill={slide.background ?? theme.background}
        listening={!!handlers}
      />
      {slide.elements.map((element) => {
        const common = commonFor(element);
        switch (element.type) {
          case 'shape':
            return (
              <Shape
                key={element.id}
                {...common}
                width={element.width}
                height={element.height}
                fill={element.fill ?? theme.accent}
                sceneFunc={(context, shape) => drawShape(context, shape, element.shape)}
              />
            );
          case 'image':
            return (
              <SlideImage
                key={element.id}
                element={element}
                common={{ ...common, width: element.width, height: element.height }}
              />
            );
          default: {
            const empty = !element.text.trim();
            if (editingId === element.id) return null;
            if (empty && !showHints) return null;
            const hint = element.role ? PLACEHOLDER_HINTS[element.role] : 'Click to add text';
            return [
              empty ? (
                <Rect
                  key={`${element.id}-outline`}
                  x={element.x}
                  y={element.y}
                  rotation={element.rotation}
                  width={element.width}
                  height={element.height}
                  stroke={theme.muted}
                  strokeWidth={1}
                  dash={[6, 4]}
                  listening={false}
                />
              ) : null,
              <Text
                key={element.id}
                {...common}
                width={element.width}
                text={empty ? hint : shownText(element)}
                fontSize={element.fontSize}
                fontFamily={theme.fontFamily}
                fontStyle={
                  `${element.italic ? 'italic ' : ''}${element.bold ? 'bold' : ''}`.trim() ||
                  'normal'
                }
                align={element.align}
                lineHeight={TEXT_LINE_HEIGHT}
                fill={empty ? theme.muted : (element.color ?? theme.text)}
                onDblClick={() => handlers?.onEditText(element.id)}
                onDblTap={() => handlers?.onEditText(element.id)}
              />,
            ];
          }
        }
      })}
    </>
  );
}
