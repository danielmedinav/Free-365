import { displayText } from './display';
import type { FormulaEngine } from './engine';
import { cellKey, type CellRange, type ChartKind, type Sheet } from './workbook';

export type ChartSeries = { name: string; values: (number | null)[] };
export type ChartData = { labels: string[]; series: ChartSeries[] };

function text(sheet: Sheet, engine: FormulaEngine, row: number, column: number): string {
  const format = sheet.cells[cellKey(row, column)]?.style?.format;
  return displayText(engine.result(sheet, row, column), format);
}

/**
 * Reads a range as chart data. A first column with text gives the labels, and a first row with text
 * gives the series names; every other column is a series. Rows a filter hides are left out.
 */
export function readChartData(
  sheet: Sheet,
  engine: FormulaEngine,
  range: CellRange,
  hidden: Set<number> = new Set(),
): ChartData {
  const value = (row: number, column: number) => engine.result(sheet, row, column).value;
  const isText = (row: number, column: number) => typeof value(row, column) === 'string';

  let hasLabels = false;
  for (let row = range.top + 1; row <= range.bottom; row++) {
    if (isText(row, range.left)) hasLabels = true;
  }
  let hasNames = false;
  for (let column = range.left + (hasLabels ? 1 : 0); column <= range.right; column++) {
    if (isText(range.top, column)) hasNames = true;
  }

  const firstRow = range.top + (hasNames ? 1 : 0);
  const firstColumn = range.left + (hasLabels ? 1 : 0);
  const labels: string[] = [];
  for (let row = firstRow; row <= range.bottom; row++) {
    if (hidden.has(row)) continue;
    labels.push(hasLabels ? text(sheet, engine, row, range.left) : String(row - firstRow + 1));
  }

  const series: ChartSeries[] = [];
  for (let column = firstColumn; column <= range.right; column++) {
    const values: (number | null)[] = [];
    for (let row = firstRow; row <= range.bottom; row++) {
      if (hidden.has(row)) continue;
      const cell = value(row, column);
      values.push(typeof cell === 'number' ? cell : null);
    }
    series.push({
      name: hasNames ? text(sheet, engine, range.top, column) : `Series ${series.length + 1}`,
      values,
    });
  }
  return { labels, series };
}

type ChartColors = { series: string[]; text: string; grid: string };

/** Colors come from the theme, so charts on screen follow it. */
function themeColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    series: [1, 2, 3, 4, 5, 6].map((n) => token(`--fs-chart-${n}`)),
    text: token('--fs-text'),
    grid: token('--fs-border'),
  };
}

/** A picture saved in a file sits on a white sheet, whatever theme is showing now. */
function paperColors(): ChartColors {
  const probe = document.createElement('div');
  probe.className = 'fs-paper';
  document.body.append(probe);
  const styles = getComputedStyle(probe);
  const colors = {
    ...themeColors(),
    text: styles.getPropertyValue('--fs-page-text').trim(),
    grid: styles.getPropertyValue('--fs-border-strong').trim(),
  };
  probe.remove();
  return colors;
}

export function chartConfig(kind: ChartKind, data: ChartData, colors = themeColors()) {
  const colorAt = (index: number) => colors.series[index % colors.series.length]!;
  const isPie = kind === 'pie';
  const series = isPie ? data.series.slice(0, 1) : data.series;

  return {
    type: kind,
    data: {
      labels: data.labels,
      datasets: series.map((item, index) => ({
        label: item.name,
        data: item.values,
        backgroundColor: isPie ? data.labels.map((_, i) => colorAt(i)) : colorAt(index),
        borderColor: isPie ? colors.grid : colorAt(index),
      })),
    },
    options: {
      animation: false as const,
      responsive: false,
      maintainAspectRatio: false,
      color: colors.text,
      plugins: { legend: { labels: { color: colors.text } } },
      scales: isPie
        ? {}
        : {
            x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
            y: { ticks: { color: colors.text }, grid: { color: colors.grid } },
          },
    },
  };
}

/** A chart as a PNG picture, for saving into a .xlsx file. */
export async function renderChartImage(
  kind: ChartKind,
  data: ChartData,
  width: number,
  height: number,
): Promise<string> {
  const { default: Chart } = await import('chart.js/auto');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const chart = new Chart(canvas, chartConfig(kind, data, paperColors()) as never);
  const url = chart.toBase64Image('image/png');
  chart.destroy();
  return url.split(',')[1] ?? '';
}
