import type { BoothSpec, Item } from '../types';

export interface Pt {
  x: number;
  y: number;
}

export interface AbsTransform {
  cx: number;
  cy: number;
  rot: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotateVec(x: number, y: number, deg: number): Pt {
  const r = rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * 기물의 절대(월드) 중심 좌표와 절대 회전.
 * 부모 체인은 위치+회전만 가지므로(스케일 없음) 단순 합성으로 계산된다.
 */
export function absTransform(items: Record<string, Item>, id: string): AbsTransform {
  const it = items[id];
  if (!it) return { cx: 0, cy: 0, rot: 0 };
  const parent = it.parentId ? items[it.parentId] : undefined;
  if (!parent) return { cx: it.x, cy: it.y, rot: it.rotation };
  const p = absTransform(items, parent.id);
  const v = rotateVec(it.x - parent.w / 2, it.y - parent.h / 2, p.rot);
  return { cx: p.cx + v.x, cy: p.cy + v.y, rot: p.rot + it.rotation };
}

/** 월드 좌표 → 특정 부모의 로컬 좌표(부모 좌상단 원점 기준). parentId가 없으면 그대로. */
export function worldToLocalPoint(
  items: Record<string, Item>,
  parentId: string | null,
  pt: Pt,
): Pt {
  const parent = parentId ? items[parentId] : undefined;
  if (!parent) return { x: pt.x, y: pt.y };
  const t = absTransform(items, parent.id);
  const v = rotateVec(pt.x - t.cx, pt.y - t.cy, -t.rot);
  return { x: v.x + parent.w / 2, y: v.y + parent.h / 2 };
}

/** 특정 부모의 로컬 좌표 → 월드 좌표 */
export function localToWorldPoint(
  items: Record<string, Item>,
  parentId: string | null,
  pt: Pt,
): Pt {
  const parent = parentId ? items[parentId] : undefined;
  if (!parent) return { x: pt.x, y: pt.y };
  const t = absTransform(items, parent.id);
  const v = rotateVec(pt.x - parent.w / 2, pt.y - parent.h / 2, t.rot);
  return { x: t.cx + v.x, y: t.cy + v.y };
}

/** 부모의 절대 회전(자기 자신 제외) */
export function parentAbsRotation(items: Record<string, Item>, id: string): number {
  const it = items[id];
  if (!it || !it.parentId || !items[it.parentId]) return 0;
  return absTransform(items, it.parentId).rot;
}

/** 회전을 반영한 절대 AABB */
export function absAABB(items: Record<string, Item>, id: string): Box {
  const it = items[id];
  const t = absTransform(items, id);
  const hw = it.w / 2;
  const hh = it.h / 2;
  const corners: Pt[] = [
    rotateVec(-hw, -hh, t.rot),
    rotateVec(hw, -hh, t.rot),
    rotateVec(hw, hh, t.rot),
    rotateVec(-hw, hh, t.rot),
  ];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const c of corners) {
    left = Math.min(left, t.cx + c.x);
    right = Math.max(right, t.cx + c.x);
    top = Math.min(top, t.cy + c.y);
    bottom = Math.max(bottom, t.cy + c.y);
  }
  return { left, top, right, bottom };
}

/** 월드 좌표가 기물 내부인지 (회전/원형 반영) */
export function pointInItem(items: Record<string, Item>, id: string, pt: Pt): boolean {
  const it = items[id];
  const t = absTransform(items, id);
  const v = rotateVec(pt.x - t.cx, pt.y - t.cy, -t.rot);
  const lx = v.x + it.w / 2;
  const ly = v.y + it.h / 2;
  if (it.shape === 'circle') {
    const nx = (lx - it.w / 2) / (it.w / 2);
    const ny = (ly - it.h / 2) / (it.h / 2);
    return nx * nx + ny * ny <= 1;
  }
  return lx >= 0 && lx <= it.w && ly >= 0 && ly <= it.h;
}

/** 자기 자신 제외 모든 하위 id (깊이 우선) */
export function descendantIds(items: Record<string, Item>, id: string): string[] {
  const out: string[] = [];
  const walk = (cur: string) => {
    const it = items[cur];
    if (!it) return;
    for (const c of it.childIds) {
      if (items[c]) {
        out.push(c);
        walk(c);
      }
    }
  };
  walk(id);
  return out;
}

export function isDescendantOf(
  items: Record<string, Item>,
  id: string,
  ancestorId: string,
): boolean {
  let cur = items[id]?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (cur === ancestorId) return true;
    cur = items[cur]?.parentId ?? null;
  }
  return false;
}

/** 가장 바깥쪽 'group' 조상 (클릭 시 그룹 전체 선택용). 없으면 자기 자신. */
export function clickTargetFor(items: Record<string, Item>, id: string): string {
  let target = id;
  let cur = items[id]?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (items[cur]?.type === 'group') target = cur;
    cur = items[cur]?.parentId ?? null;
  }
  return target;
}

/** 조상 중에 group이 있는지 (그룹 멤버는 개별 클릭/드래그 비활성) */
export function hasGroupAncestor(items: Record<string, Item>, id: string): boolean {
  let cur = items[id]?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (items[cur]?.type === 'group') return true;
    cur = items[cur]?.parentId ?? null;
  }
  return false;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((acc, b) => ({
    left: Math.min(acc.left, b.left),
    top: Math.min(acc.top, b.top),
    right: Math.max(acc.right, b.right),
    bottom: Math.max(acc.bottom, b.bottom),
  }));
}

/**
 * 드롭 지점 아래에서 부모가 될 기물을 찾는다.
 * - 위(z상단)에 있는 것부터, 자식을 부모보다 먼저(더 깊은 것 우선) 검사
 * - 드래그 중인 서브트리/숨김 기물 제외
 * - 자기보다 작은 기물 위에는 얹지 않음 (책상이 의자 위로 들어가는 것 방지)
 */
export function findDropTarget(
  items: Record<string, Item>,
  rootIds: string[],
  worldPt: Pt,
  draggedIds: string[],
): string | null {
  const forbidden = new Set<string>();
  let dragArea = 0;
  for (const id of draggedIds) {
    forbidden.add(id);
    for (const d of descendantIds(items, id)) forbidden.add(d);
    const it = items[id];
    if (it) dragArea = Math.max(dragArea, it.w * it.h);
  }
  const visit = (ids: string[]): string | null => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i];
      const it = items[id];
      if (!it || forbidden.has(id) || !it.visible) continue;
      const hit = visit(it.childIds);
      if (hit) return hit;
      // 그룹 자체는 드롭 대상이 아님 (그룹 멤버가 되면 직접 클릭이 불가능해짐)
      if (it.type === 'group') continue;
      if (it.w * it.h >= dragArea && pointInItem(items, id, worldPt)) return id;
    }
    return null;
  };
  return visit(rootIds);
}

/** 부스 사각형의 Box */
export function boothBox(booth: BoothSpec): Box {
  return { left: 0, top: 0, right: booth.w, bottom: booth.h };
}
