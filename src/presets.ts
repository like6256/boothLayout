import type { ShapeKind } from './types';

/**
 * 기물 카탈로그. 새 기물은 여기에 한 줄 추가하면 팔레트에 자동으로 나타난다.
 * 크기는 실제 치수(mm).
 */
export interface CatalogEntry {
  key: string;
  label: string;
  shape: ShapeKind;
  w: number;
  h: number;
  color: string;
}

export const CATALOG: CatalogEntry[] = [
  { key: 'desk', label: '책상', shape: 'rect', w: 1800, h: 600, color: '#d9a86b' },
  { key: 'acrylic', label: '아크릴 진열대', shape: 'rect', w: 300, h: 300, color: '#8ec9ea' },
  { key: 'gacha', label: '뽑기통', shape: 'circle', w: 400, h: 400, color: '#f2a0b4' },
  { key: 'chair', label: '의자', shape: 'rect', w: 450, h: 450, color: '#9aa5b1' },
  { key: 'banner', label: '배너', shape: 'rect', w: 600, h: 200, color: '#84d19b' },
  { key: 'shelf', label: '선반', shape: 'rect', w: 900, h: 300, color: '#b48ec7' },
  { key: 'box', label: '박스', shape: 'rect', w: 400, h: 400, color: '#e3bd6d' },
  { key: 'pop', label: 'POP', shape: 'rect', w: 200, h: 100, color: '#f4d35e' },
  { key: 'product', label: '상품', shape: 'rect', w: 150, h: 150, color: '#f19066' },
  { key: 'table', label: '원탁', shape: 'circle', w: 900, h: 900, color: '#d9a86b' },
  { key: 'rect', label: '사각형', shape: 'rect', w: 500, h: 500, color: '#b8bfc7' },
  { key: 'circle', label: '원형', shape: 'circle', w: 500, h: 500, color: '#b8bfc7' },
];

export const CATALOG_MAP: Record<string, CatalogEntry> = Object.fromEntries(
  CATALOG.map((c) => [c.key, c]),
);

/** 부스 크기 프리셋 (mm) */
export const BOOTH_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '2m × 2m', w: 2000, h: 2000 },
  { label: '3m × 2m', w: 3000, h: 2000 },
  { label: '3m × 3m', w: 3000, h: 3000 },
  { label: '4m × 2m', w: 4000, h: 2000 },
  { label: '6m × 3m', w: 6000, h: 3000 },
];
