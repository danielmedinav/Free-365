import { memo } from 'react';
import { Layer, Stage } from 'react-konva';
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide, type Theme } from './deck';
import { SlideContent } from './SlideContent';

const THUMB_WIDTH = 168;

type SlideThumbProps = { slide: Slide; theme: Theme };

/** Memoized: a slide object only changes when something on that slide does. */
export const SlideThumb = memo(function SlideThumb({ slide, theme }: SlideThumbProps) {
  const scale = THUMB_WIDTH / SLIDE_WIDTH;
  return (
    <Stage
      width={THUMB_WIDTH}
      height={SLIDE_HEIGHT * scale}
      scaleX={scale}
      scaleY={scale}
      listening={false}
    >
      <Layer listening={false}>
        <SlideContent slide={slide} theme={theme} />
      </Layer>
    </Stage>
  );
});
