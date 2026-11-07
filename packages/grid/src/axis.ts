/** Positions along one side of the grid, so only what's on screen needs rendering. */
export type Axis = {
  count: number;
  total: number;
  start(index: number): number;
  size(index: number): number;
  /** The index at this pixel offset, clamped to the grid. */
  indexAt(offset: number): number;
};

export function createAxis(count: number, sizeOf: (index: number) => number): Axis {
  const starts = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) starts[i + 1] = starts[i]! + sizeOf(i);

  return {
    count,
    total: starts[count]!,
    start: (index) => starts[index]!,
    size: (index) => starts[index + 1]! - starts[index]!,
    indexAt(offset) {
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (starts[middle]! <= offset) low = middle;
        else high = middle - 1;
      }
      return low;
    },
  };
}
