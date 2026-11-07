import { IconButton, useTheme } from '@free360/ui';
import { X } from 'lucide-react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { chartConfig, type ChartData } from './charts';
import styles from './ChartBox.module.css';
import type { ChartDefinition } from './workbook';

type ChartBoxProps = {
  chart: ChartDefinition;
  data: ChartData;
  onMove: (patch: Partial<ChartDefinition>) => void;
  onDelete: () => void;
};

const MIN_WIDTH = 200;
const MIN_HEIGHT = 140;

const KIND_NAMES = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart' };

/** One chart floating over the cells. It redraws when its data changes, and can be dragged. */
export function ChartBox({ chart, data, onMove, onDelete }: ChartBoxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(data);
  // Redrawn when the theme changes, as its colors are painted into the canvas.
  const { resolved: theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    let instance: { destroy(): void } | undefined;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      const config = chartConfig(chart.kind, JSON.parse(signature) as ChartData);
      instance = new Chart(canvasRef.current, config as never);
    });
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [chart.kind, chart.width, chart.height, signature, theme]);

  /** Follows the pointer directly, and saves once at the end so a drag is one undo step. */
  const drag = (
    event: ReactPointerEvent,
    update: (box: HTMLDivElement, dx: number, dy: number) => void,
    finish: (dx: number, dy: number) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const onMovePointer = (move: PointerEvent) => {
      update(box, move.clientX - startX, move.clientY - startY);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMovePointer);
      window.removeEventListener('pointerup', onUp);
      finish(up.clientX - startX, up.clientY - startY);
    };
    window.addEventListener('pointermove', onMovePointer);
    window.addEventListener('pointerup', onUp);
  };

  const startMove = (event: ReactPointerEvent) => {
    drag(
      event,
      (box, dx, dy) => {
        box.style.left = `${Math.max(0, chart.x + dx)}px`;
        box.style.top = `${Math.max(0, chart.y + dy)}px`;
      },
      (dx, dy) => {
        if (dx || dy) onMove({ x: Math.max(0, chart.x + dx), y: Math.max(0, chart.y + dy) });
      },
    );
  };

  const startResize = (event: ReactPointerEvent) => {
    drag(
      event,
      (box, dx, dy) => {
        box.style.width = `${Math.max(MIN_WIDTH, chart.width + dx)}px`;
        box.style.height = `${Math.max(MIN_HEIGHT, chart.height + dy)}px`;
      },
      (dx, dy) => {
        if (!dx && !dy) return;
        onMove({
          width: Math.max(MIN_WIDTH, chart.width + dx),
          height: Math.max(MIN_HEIGHT, chart.height + dy),
        });
      },
    );
  };

  const titleHeight = 28;
  return (
    <div
      ref={boxRef}
      className={styles.box}
      role="figure"
      aria-label={KIND_NAMES[chart.kind]}
      style={{ left: chart.x, top: chart.y, width: chart.width, height: chart.height }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={styles.title} onPointerDown={startMove}>
        <span>{KIND_NAMES[chart.kind]}</span>
        <IconButton
          label="Delete chart"
          className={styles.close}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDelete}
        >
          <X size={14} aria-hidden />
        </IconButton>
      </div>
      <canvas
        key={`${chart.width}x${chart.height}`}
        ref={canvasRef}
        width={chart.width}
        height={chart.height - titleHeight}
      />
      <span className={styles.handle} onPointerDown={startResize} />
    </div>
  );
}
