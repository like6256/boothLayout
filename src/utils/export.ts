import type { Item, ProjectDoc } from '../types';
import { absAABB, boothBox, unionBoxes, type Box } from './geometry';
import { sanitizeFilename, triggerDownload } from './persist';

const FONT_FAMILY = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 이름 라벨의 대비 색 */
function labelColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#222';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#222222' : '#ffffff';
}

function labelFontSize(it: Item): number {
  const len = Math.max(1, it.name.length);
  return Math.min(it.h * 0.4, (it.w * 0.9) / (len * 0.62), 120);
}

function itemToSvg(items: Record<string, Item>, id: string): string {
  const it = items[id];
  if (!it || !it.visible) return '';
  const tf = `translate(${it.x} ${it.y}) rotate(${it.rotation}) translate(${-it.w / 2} ${-it.h / 2})`;
  const isGroup = it.type === 'group';
  let shape = '';
  if (!isGroup) {
    if (it.shape === 'circle') {
      shape = `<ellipse cx="${it.w / 2}" cy="${it.h / 2}" rx="${it.w / 2}" ry="${it.h / 2}" fill="${esc(it.color)}" stroke="#333333" stroke-width="3"/>`;
    } else {
      shape = `<rect width="${it.w}" height="${it.h}" rx="10" fill="${esc(it.color)}" stroke="#333333" stroke-width="3"/>`;
    }
  }
  const fs = labelFontSize(it);
  const label =
    !isGroup && fs >= 20
      ? `<text x="${it.w / 2}" y="${it.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_FAMILY}" font-size="${fs.toFixed(1)}" fill="${labelColor(it.color)}">${esc(it.name)}</text>`
      : '';
  const children = it.childIds.map((c) => itemToSvg(items, c)).join('');
  return `<g transform="${tf}">${shape}${label}${children}</g>`;
}

export function contentBounds(doc: ProjectDoc): Box {
  const boxes: Box[] = [boothBox(doc.booth)];
  for (const id of doc.rootIds) {
    if (doc.items[id]?.visible) boxes.push(absAABB(doc.items, id));
  }
  const b = unionBoxes(boxes)!;
  const pad = Math.max(150, Math.max(doc.booth.w, doc.booth.h) * 0.05);
  return {
    left: b.left - pad,
    top: b.top - pad,
    right: b.right + pad,
    bottom: b.bottom + pad,
  };
}

/** 프로젝트 전체를 SVG 문자열로 (물리 크기 mm 지정 → 인쇄 시 실척) */
export function buildSvg(doc: ProjectDoc): string {
  const b = contentBounds(doc);
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const dimFs = Math.max(40, Math.min(doc.booth.w, doc.booth.h) * 0.035);
  const boothLabel = `${doc.booth.w} × ${doc.booth.h} mm`;
  const body = doc.rootIds.map((id) => itemToSvg(doc.items, id)).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.left} ${b.top} ${w} ${h}" width="${w}mm" height="${h}mm">`,
    `<rect x="${b.left}" y="${b.top}" width="${w}" height="${h}" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${doc.booth.w}" height="${doc.booth.h}" fill="#fcfcfc" stroke="#111111" stroke-width="8"/>`,
    `<text x="${doc.booth.w / 2}" y="${-dimFs * 0.6}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${dimFs}" fill="#555555">${esc(doc.name)} (${boothLabel})</text>`,
    body,
    `</svg>`,
  ].join('\n');
}

export function exportSvg(doc: ProjectDoc): void {
  const svg = buildSvg(doc);
  triggerDownload(
    new Blob([svg], { type: 'image/svg+xml' }),
    `${sanitizeFilename(doc.name)}.svg`,
  );
}

/** SVG → 캔버스 래스터화 (PNG/PDF 공용) */
async function rasterize(doc: ProjectDoc): Promise<{ canvas: HTMLCanvasElement; b: Box }> {
  const b = contentBounds(doc);
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  // 긴 변 기준 약 2400px, 최대 4px/mm
  const k = Math.min(4, Math.max(0.2, 2400 / Math.max(w, h)));
  const svg = buildSvg(doc);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG 렌더링 실패'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, b };
}

export async function exportPng(doc: ProjectDoc): Promise<void> {
  const { canvas } = await rasterize(doc);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('PNG 생성 실패');
  triggerDownload(blob, `${sanitizeFilename(doc.name)}.png`);
}

export async function exportPdf(doc: ProjectDoc): Promise<void> {
  const { canvas, b } = await rasterize(doc);
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [w, h],
  });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
  pdf.save(`${sanitizeFilename(doc.name)}.pdf`);
}
