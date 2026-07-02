import type { Item } from '../types';

const DEFAULT_ITEM_HEIGHTS: Record<string, number> = {
  desk: 740,
  acrylic: 300,
  gacha: 900,
  chair: 450,
  banner: 1400,
  shelf: 1200,
  box: 400,
  pop: 900,
  product: 180,
  table: 720,
};

export function defaultItemHeight(type: string, w: number, h: number): number {
  if (type === 'group') return 40;
  return DEFAULT_ITEM_HEIGHTS[type] ?? Math.min(900, Math.max(160, Math.min(w, h) * 0.7));
}

export function getItemHeight(item: Item): number {
  return item.height ?? defaultItemHeight(item.type, item.w, item.h);
}
