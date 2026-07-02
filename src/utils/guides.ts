import type { BoothSpec, GuideLine, Item } from '../types';
import { absAABB, boothBox, descendantIds, type Box, type Pt } from './geometry';

export interface GuideResult {
  dx: number;
  dy: number;
  guides: GuideLine[];
}

interface Cand {
  value: number;
  box: Box;
}

/**
 * 스마트 가이드: 드래그 중인 기물의 AABB를 다른 루트 기물/부스의
 * 가장자리·중심선에 임계값 이내로 끌어당기고, 표시할 가이드 라인을 돌려준다.
 *
 * @param proposedCenter 스냅 전 제안된 월드 중심
 * @param threshold 스냅 임계값 (mm, 화면 픽셀 기준을 scale로 나눠 전달)
 */
export function computeSmartGuides(
  items: Record<string, Item>,
  rootIds: string[],
  booth: BoothSpec,
  draggedIds: string[],
  draggedBoxAtStart: Box,
  startCenter: Pt,
  proposedCenter: Pt,
  threshold: number,
): GuideResult {
  const exclude = new Set<string>();
  for (const id of draggedIds) {
    exclude.add(id);
    for (const d of descendantIds(items, id)) exclude.add(d);
  }

  // 이동 중 회전은 변하지 않으므로 AABB는 평행이동만 하면 된다
  const dx0 = proposedCenter.x - startCenter.x;
  const dy0 = proposedCenter.y - startCenter.y;
  const box: Box = {
    left: draggedBoxAtStart.left + dx0,
    right: draggedBoxAtStart.right + dx0,
    top: draggedBoxAtStart.top + dy0,
    bottom: draggedBoxAtStart.bottom + dy0,
  };

  const vCands: Cand[] = [];
  const hCands: Cand[] = [];
  const pushBox = (b: Box) => {
    vCands.push({ value: b.left, box: b }, { value: (b.left + b.right) / 2, box: b }, { value: b.right, box: b });
    hCands.push({ value: b.top, box: b }, { value: (b.top + b.bottom) / 2, box: b }, { value: b.bottom, box: b });
  };
  pushBox(boothBox(booth));
  for (const id of rootIds) {
    const it = items[id];
    if (!it || exclude.has(id) || !it.visible) continue;
    pushBox(absAABB(items, id));
  }

  const myV = [box.left, (box.left + box.right) / 2, box.right];
  const myH = [box.top, (box.top + box.bottom) / 2, box.bottom];

  let bestV: { diff: number; cand: Cand } | null = null;
  for (const cand of vCands) {
    for (const mv of myV) {
      const diff = cand.value - mv;
      if (Math.abs(diff) <= threshold && (!bestV || Math.abs(diff) < Math.abs(bestV.diff))) {
        bestV = { diff, cand };
      }
    }
  }
  let bestH: { diff: number; cand: Cand } | null = null;
  for (const cand of hCands) {
    for (const mh of myH) {
      const diff = cand.value - mh;
      if (Math.abs(diff) <= threshold && (!bestH || Math.abs(diff) < Math.abs(bestH.diff))) {
        bestH = { diff, cand };
      }
    }
  }

  const guides: GuideLine[] = [];
  const dx = bestV ? bestV.diff : 0;
  const dy = bestH ? bestH.diff : 0;
  const finalBox: Box = {
    left: box.left + dx,
    right: box.right + dx,
    top: box.top + dy,
    bottom: box.bottom + dy,
  };
  const EXT = 80;
  if (bestV) {
    const x = bestV.cand.value;
    const top = Math.min(finalBox.top, bestV.cand.box.top) - EXT;
    const bottom = Math.max(finalBox.bottom, bestV.cand.box.bottom) + EXT;
    guides.push({ points: [x, top, x, bottom] });
  }
  if (bestH) {
    const y = bestH.cand.value;
    const left = Math.min(finalBox.left, bestH.cand.box.left) - EXT;
    const right = Math.max(finalBox.right, bestH.cand.box.right) + EXT;
    guides.push({ points: [left, y, right, y] });
  }
  return { dx, dy, guides };
}
