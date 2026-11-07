import { jsPDF } from 'jspdf';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Layer, Stage } from 'react-konva';
import { SLIDE_HEIGHT, SLIDE_WIDTH, themeOf, type Deck, type Slide, type Theme } from '../deck';
import { loadImage } from '../imageCache';
import { SlideContent } from '../SlideContent';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Draws a slide off-screen, the same way it shows in the editor, and returns it as a picture. */
async function renderSlideImage(slide: Slide, theme: Theme): Promise<string> {
  await Promise.all(
    slide.elements.flatMap((element) =>
      element.type === 'image' ? [loadImage(element.src).catch(() => undefined)] : [],
    ),
  );

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0';
  document.body.append(host);
  const root = createRoot(host);
  let stage: KonvaStage | null = null;
  try {
    flushSync(() => {
      root.render(
        <Stage
          ref={(node) => {
            stage = node;
          }}
          width={SLIDE_WIDTH}
          height={SLIDE_HEIGHT}
        >
          <Layer>
            <SlideContent slide={slide} theme={theme} />
          </Layer>
        </Stage>,
      );
    });
    // The drawing library finishes on its own schedule.
    await nextFrame();
    await nextFrame();
    const drawn = stage as KonvaStage | null;
    if (!drawn) throw new Error('Could not draw the slide');
    drawn.draw();
    return drawn.toDataURL({ mimeType: 'image/png', pixelRatio: 2 });
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Creates a PDF with one page per slide. Each page is a picture of its slide. */
export async function exportPdf(deck: Deck): Promise<Blob> {
  const theme = themeOf(deck);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [SLIDE_WIDTH, SLIDE_HEIGHT],
    compress: true,
  });
  for (const [index, slide] of deck.slides.entries()) {
    if (index > 0) pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape');
    pdf.addImage(await renderSlideImage(slide, theme), 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  }
  return pdf.output('blob');
}
