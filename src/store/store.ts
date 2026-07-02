import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  AlignKind,
  BoothSpec,
  Camera,
  DistributeAxis,
  FavPreset,
  GuideLine,
  Item,
  ProjectDoc,
  RecentEntry,
  Unit,
} from '../types';
import { CATALOG_MAP } from '../presets';
import { newId } from '../utils/id';
import {
  absAABB,
  absTransform,
  boothBox,
  descendantIds,
  isDescendantOf,
  localToWorldPoint,
  unionBoxes,
  worldToLocalPoint,
  type Pt,
} from '../utils/geometry';
import {
  loadAutosaveDoc,
  loadFavorites,
  loadPrefs,
  loadRecents,
  saveFavorites,
  saveRecents,
} from '../utils/persist';

/** undo/redo 대상이 되는 문서 부분 */
interface DocSlice {
  projectName: string;
  unit: Unit;
  booth: BoothSpec;
  items: Record<string, Item>;
  rootIds: string[];
}

interface ClipboardData {
  items: Record<string, Item>;
  tops: { id: string; parentId: string | null; absCenter: Pt; absRot: number }[];
  pasteCount: number;
}

interface UISlice {
  selection: string[];
  camera: Camera;
  containerSize: { w: number; h: number };
  gridOn: boolean;
  snapOn: boolean;
  gridSize: number;
  autoNest: boolean;
  smartGuidesOn: boolean;
  dark: boolean;
  tool: 'select' | 'pan';
  spaceDown: boolean;
  guides: GuideLine[];
  pointer: Pt | null;
  clipboard: ClipboardData | null;
  boothDialog: 'closed' | 'edit' | 'new';
  favorites: FavPreset[];
  recents: RecentEntry[];
}

interface Actions {
  // 문서
  setProjectName: (name: string) => void;
  setUnit: (unit: Unit) => void;
  setBooth: (booth: BoothSpec) => void;
  newProject: (booth: BoothSpec) => void;
  loadProject: (doc: ProjectDoc) => void;

  // 기물 CRUD
  addFromCatalog: (key: string) => void;
  updateItems: (patches: Record<string, Partial<Item>>) => void;
  deleteItems: (ids: string[]) => void;
  deleteSelection: () => void;
  commitDrag: (args: {
    positions: Record<string, { x: number; y: number }>;
    reparent?: { id: string; parentId: string | null; world: Pt; absRot: number };
  }) => void;
  reorderItem: (id: string, dir: 'up' | 'down' | 'front' | 'back') => void;
  reorderSelection: (dir: 'up' | 'down' | 'front' | 'back') => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  alignSelection: (kind: AlignKind) => void;
  distributeSelection: (axis: DistributeAxis) => void;
  moveSelectedByWorld: (dx: number, dy: number) => void;

  // 선택
  setSelection: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  pruneSelection: () => void;

  // 뷰/환경
  setCamera: (cam: Partial<Camera>) => void;
  setContainerSize: (w: number, h: number) => void;
  fitView: () => void;
  zoomAt: (screenPt: Pt, factor: number) => void;
  setZoom: (scale: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setGridSize: (mm: number) => void;
  toggleAutoNest: () => void;
  toggleSmartGuides: () => void;
  toggleDark: () => void;
  setTool: (tool: 'select' | 'pan') => void;
  setSpaceDown: (down: boolean) => void;
  setGuides: (guides: GuideLine[]) => void;
  setPointer: (pt: Pt | null) => void;
  setBoothDialog: (mode: 'closed' | 'edit' | 'new') => void;

  // 즐겨찾기 / 최근
  addFavoriteFromSelection: () => void;
  removeFavorite: (id: string) => void;
  insertFavorite: (fav: FavPreset) => void;
  pushRecent: () => void;
  loadRecent: (id: string) => void;
}

export type AppStore = DocSlice & UISlice & Actions;

const DEFAULT_BOOTH: BoothSpec = { w: 3000, h: 3000 };

function normalizeDeg(d: number): number {
  const n = d % 360;
  return n < 0 ? n + 360 : Math.round(n * 100) / 100;
}

function clampSize(v: number): number {
  return Math.min(50000, Math.max(10, v));
}

/** 조상이 선택에 함께 들어있는 id는 제거 (부모/자식 동시 선택 금지) */
function normalizeSelection(items: Record<string, Item>, ids: string[]): string[] {
  const set = new Set(ids.filter((id) => items[id]));
  return [...set].filter((id) => {
    let cur = items[id]?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 1000) {
      if (set.has(cur)) return false;
      cur = items[cur]?.parentId ?? null;
    }
    return true;
  });
}

/** 그리기(페인트) 순서로 평탄화 — z순서 비교용 */
function flattenRenderOrder(items: Record<string, Item>, rootIds: string[]): string[] {
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      if (!items[id]) continue;
      out.push(id);
      walk(items[id].childIds);
    }
  };
  walk(rootIds);
  return out;
}

/** 컨테이너(부모 childIds 또는 rootIds)에서 id 제거한 새 구조 반환 */
function removeFromContainer(
  items: Record<string, Item>,
  rootIds: string[],
  id: string,
): { items: Record<string, Item>; rootIds: string[] } {
  const it = items[id];
  if (!it) return { items, rootIds };
  if (it.parentId && items[it.parentId]) {
    const p = items[it.parentId];
    return {
      items: { ...items, [p.id]: { ...p, childIds: p.childIds.filter((c) => c !== id) } },
      rootIds,
    };
  }
  return { items, rootIds: rootIds.filter((r) => r !== id) };
}

/** 서브트리 딥클론 (새 id 부여) */
function cloneSubtrees(
  src: Record<string, Item>,
  topIds: string[],
): { newItems: Record<string, Item>; newTopIds: string[] } {
  const idMap = new Map<string, string>();
  const collect: string[] = [];
  for (const top of topIds) {
    if (!src[top]) continue;
    collect.push(top, ...descendantIds(src, top));
  }
  for (const id of collect) idMap.set(id, newId());
  const newItems: Record<string, Item> = {};
  for (const id of collect) {
    const it = src[id];
    const nid = idMap.get(id)!;
    newItems[nid] = {
      ...it,
      id: nid,
      parentId: it.parentId && idMap.has(it.parentId) ? idMap.get(it.parentId)! : null,
      childIds: it.childIds.filter((c) => idMap.has(c)).map((c) => idMap.get(c)!),
    };
  }
  return { newItems, newTopIds: topIds.filter((t) => src[t]).map((t) => idMap.get(t)!) };
}

function initialDoc(): DocSlice {
  const saved = loadAutosaveDoc();
  if (saved) {
    return {
      projectName: saved.name,
      unit: saved.unit,
      booth: saved.booth,
      items: saved.items,
      rootIds: saved.rootIds,
    };
  }
  return {
    projectName: '새 부스 배치',
    unit: 'cm',
    booth: { ...DEFAULT_BOOTH },
    items: {},
    rootIds: [],
  };
}

function initialUI(): UISlice {
  const prefs = loadPrefs();
  return {
    selection: [],
    camera: { x: 0, y: 0, scale: 0.2 },
    containerSize: { w: 800, h: 600 },
    gridOn: prefs.gridOn ?? true,
    snapOn: prefs.snapOn ?? true,
    gridSize: prefs.gridSize ?? 100,
    autoNest: prefs.autoNest ?? true,
    smartGuidesOn: prefs.smartGuidesOn ?? true,
    dark: prefs.dark ?? false,
    tool: 'select',
    spaceDown: false,
    guides: [],
    pointer: null,
    clipboard: null,
    boothDialog: 'closed',
    favorites: loadFavorites(),
    recents: loadRecents(),
  };
}

/** 화면 중앙의 월드 좌표 */
function viewportCenterWorld(s: Pick<AppStore, 'camera' | 'containerSize'>): Pt {
  return {
    x: (s.containerSize.w / 2 - s.camera.x) / s.camera.scale,
    y: (s.containerSize.h / 2 - s.camera.y) / s.camera.scale,
  };
}

export const useApp = create<AppStore>()(
  temporal(
    (set, get) => ({
      ...initialDoc(),
      ...initialUI(),

      // ── 문서 ──────────────────────────────────────────────
      setProjectName: (name) => set({ projectName: name }),
      setUnit: (unit) => set({ unit }),
      setBooth: (booth) =>
        set({ booth: { w: clampSize(booth.w), h: clampSize(booth.h) } }),
      newProject: (booth) => {
        set({
          projectName: '새 부스 배치',
          booth: { w: clampSize(booth.w), h: clampSize(booth.h) },
          items: {},
          rootIds: [],
          selection: [],
          clipboard: null,
        });
        get().fitView();
      },
      loadProject: (doc) => {
        set({
          projectName: doc.name || '이름 없는 프로젝트',
          unit: doc.unit || 'cm',
          booth: doc.booth || { ...DEFAULT_BOOTH },
          items: doc.items || {},
          rootIds: doc.rootIds || [],
          selection: [],
        });
        get().fitView();
      },

      // ── 기물 CRUD ─────────────────────────────────────────
      addFromCatalog: (key) => {
        const entry = CATALOG_MAP[key];
        if (!entry) return;
        const s = get();
        const center = viewportCenterWorld(s);
        const g = s.gridSize;
        const x = s.snapOn ? Math.round(center.x / g) * g : Math.round(center.x);
        const y = s.snapOn ? Math.round(center.y / g) * g : Math.round(center.y);
        const count = Object.values(s.items).filter((i) => i.type === key).length;
        const id = newId();
        const item: Item = {
          id,
          type: key,
          shape: entry.shape,
          name: count > 0 ? `${entry.label} ${count + 1}` : entry.label,
          x,
          y,
          w: entry.w,
          h: entry.h,
          rotation: 0,
          color: entry.color,
          memo: '',
          parentId: null,
          childIds: [],
          visible: true,
          locked: false,
        };
        set({
          items: { ...s.items, [id]: item },
          rootIds: [...s.rootIds, id],
          selection: [id],
        });
      },

      updateItems: (patches) => {
        const s = get();
        const items = { ...s.items };
        let changed = false;
        for (const [id, patch] of Object.entries(patches)) {
          if (!items[id]) continue;
          const next = { ...items[id], ...patch };
          if (patch.w !== undefined) next.w = clampSize(patch.w);
          if (patch.h !== undefined) next.h = clampSize(patch.h);
          if (patch.rotation !== undefined) next.rotation = normalizeDeg(patch.rotation);
          items[id] = next;
          changed = true;
        }
        if (changed) set({ items });
      },

      deleteItems: (ids) => {
        const s = get();
        const targets = ids.filter((id) => s.items[id] && !s.items[id].locked);
        if (targets.length === 0) return;
        const removeSet = new Set<string>();
        for (const id of targets) {
          removeSet.add(id);
          for (const d of descendantIds(s.items, id)) removeSet.add(d);
        }
        const items: Record<string, Item> = {};
        for (const [id, it] of Object.entries(s.items)) {
          if (removeSet.has(id)) continue;
          items[id] = it.childIds.some((c) => removeSet.has(c))
            ? { ...it, childIds: it.childIds.filter((c) => !removeSet.has(c)) }
            : it;
        }
        set({
          items,
          rootIds: s.rootIds.filter((r) => !removeSet.has(r)),
          selection: s.selection.filter((id) => !removeSet.has(id)),
        });
      },
      deleteSelection: () => get().deleteItems(get().selection),

      commitDrag: ({ positions, reparent }) => {
        const s = get();
        let items = { ...s.items };
        let rootIds = s.rootIds;
        for (const [id, p] of Object.entries(positions)) {
          if (items[id]) items[id] = { ...items[id], x: p.x, y: p.y };
        }
        if (reparent && items[reparent.id]) {
          // 순환 방지: 자기 서브트리 안으로는 못 들어간다
          const invalid =
            reparent.parentId != null &&
            (reparent.parentId === reparent.id ||
              isDescendantOf(items, reparent.parentId, reparent.id));
          if (!invalid) {
            const removed = removeFromContainer(items, rootIds, reparent.id);
            items = removed.items;
            rootIds = removed.rootIds;
            const local = worldToLocalPoint(items, reparent.parentId, reparent.world);
            const parentRot = reparent.parentId
              ? absTransform(items, reparent.parentId).rot
              : 0;
            items[reparent.id] = {
              ...items[reparent.id],
              parentId: reparent.parentId,
              x: local.x,
              y: local.y,
              rotation: normalizeDeg(reparent.absRot - parentRot),
            };
            if (reparent.parentId && items[reparent.parentId]) {
              const p = items[reparent.parentId];
              items[p.id] = { ...p, childIds: [...p.childIds, reparent.id] };
            } else {
              rootIds = [...rootIds, reparent.id];
            }
          }
        }
        set({ items, rootIds, guides: [] });
      },

      reorderItem: (id, dir) => {
        const s = get();
        const it = s.items[id];
        if (!it) return;
        const inRoot = !it.parentId || !s.items[it.parentId];
        const list = inRoot ? [...s.rootIds] : [...s.items[it.parentId!].childIds];
        const idx = list.indexOf(id);
        if (idx < 0) return;
        list.splice(idx, 1);
        const to =
          dir === 'front' ? list.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(idx + 1, list.length) : Math.max(idx - 1, 0);
        list.splice(to, 0, id);
        if (inRoot) set({ rootIds: list });
        else {
          const p = s.items[it.parentId!];
          set({ items: { ...s.items, [p.id]: { ...p, childIds: list } } });
        }
      },
      reorderSelection: (dir) => {
        for (const id of get().selection) get().reorderItem(id, dir);
      },

      toggleVisible: (id) => {
        const it = get().items[id];
        if (it) get().updateItems({ [id]: { visible: !it.visible } });
      },
      toggleLock: (id) => {
        const it = get().items[id];
        if (it) get().updateItems({ [id]: { locked: !it.locked } });
      },

      groupSelection: () => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection).filter(
          (id) => !s.items[id].locked,
        );
        if (sel.length < 2) return;
        const order = flattenRenderOrder(s.items, s.rootIds);
        const sorted = [...sel].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const box = unionBoxes(sorted.map((id) => absAABB(s.items, id)));
        if (!box) return;
        const parentIds = new Set(sorted.map((id) => s.items[id].parentId ?? null));
        const groupParent =
          parentIds.size === 1 ? ([...parentIds][0] as string | null) : null;
        const groupId = newId();
        const centerWorld: Pt = {
          x: (box.left + box.right) / 2,
          y: (box.top + box.bottom) / 2,
        };
        // 절대 좌표 스냅샷 (재배치 전에)
        const absList = sorted.map((id) => ({
          id,
          t: absTransform(s.items, id),
        }));

        let items = { ...s.items };
        let rootIds = s.rootIds;
        const localCenter = worldToLocalPoint(items, groupParent, centerWorld);
        const groupParentRot = groupParent ? absTransform(items, groupParent).rot : 0;
        const group: Item = {
          id: groupId,
          type: 'group',
          shape: 'rect',
          name: '그룹',
          x: localCenter.x,
          y: localCenter.y,
          w: box.right - box.left,
          h: box.bottom - box.top,
          rotation: normalizeDeg(-groupParentRot),
          color: 'transparent',
          memo: '',
          parentId: groupParent,
          childIds: [],
          visible: true,
          locked: false,
        };
        items[groupId] = group;
        if (groupParent && items[groupParent]) {
          const p = items[groupParent];
          items[p.id] = { ...p, childIds: [...p.childIds, groupId] };
        } else {
          rootIds = [...rootIds, groupId];
        }
        // 멤버들을 그룹 안으로 (월드 위치 유지)
        for (const { id, t } of absList) {
          const removed = removeFromContainer(items, rootIds, id);
          items = removed.items;
          rootIds = removed.rootIds;
          const groupAbs = absTransform(items, groupId);
          const local = worldToLocalPoint(items, groupId, { x: t.cx, y: t.cy });
          items[id] = {
            ...items[id],
            parentId: groupId,
            x: local.x,
            y: local.y,
            rotation: normalizeDeg(t.rot - groupAbs.rot),
          };
          items[groupId] = {
            ...items[groupId],
            childIds: [...items[groupId].childIds, id],
          };
        }
        set({ items, rootIds, selection: [groupId] });
      },

      ungroupSelection: () => {
        const s = get();
        const groups = s.selection.filter((id) => s.items[id]?.type === 'group');
        if (groups.length === 0) return;
        let items = { ...s.items };
        let rootIds = s.rootIds;
        const released: string[] = [];
        for (const gid of groups) {
          const g = items[gid];
          if (!g) continue;
          const children = [...g.childIds];
          for (const cid of children) {
            const t = absTransform(items, cid);
            const removed = removeFromContainer(items, rootIds, cid);
            items = removed.items;
            rootIds = removed.rootIds;
            const local = worldToLocalPoint(items, g.parentId, { x: t.cx, y: t.cy });
            const parentRot =
              g.parentId && items[g.parentId] ? absTransform(items, g.parentId).rot : 0;
            items[cid] = {
              ...items[cid],
              parentId: g.parentId && items[g.parentId] ? g.parentId : null,
              x: local.x,
              y: local.y,
              rotation: normalizeDeg(t.rot - parentRot),
            };
            if (g.parentId && items[g.parentId]) {
              const p = items[g.parentId];
              items[p.id] = { ...p, childIds: [...p.childIds, cid] };
            } else {
              rootIds = [...rootIds, cid];
            }
            released.push(cid);
          }
          // 빈 그룹 제거
          const removedG = removeFromContainer(items, rootIds, gid);
          items = removedG.items;
          rootIds = removedG.rootIds;
          delete items[gid];
        }
        set({ items, rootIds, selection: released });
      },

      duplicateSelection: () => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection);
        if (sel.length === 0) return;
        const { newItems, newTopIds } = cloneSubtrees(s.items, sel);
        const OFFSET = 100;
        let items = { ...s.items, ...newItems };
        let rootIds = [...s.rootIds];
        for (const nid of newTopIds) {
          const it = items[nid];
          items[nid] = { ...it, x: it.x + OFFSET, y: it.y + OFFSET };
          if (it.parentId && items[it.parentId]) {
            const p = items[it.parentId];
            items[p.id] = { ...p, childIds: [...p.childIds, nid] };
          } else {
            items[nid] = { ...items[nid], parentId: null };
            rootIds.push(nid);
          }
        }
        set({ items, rootIds, selection: newTopIds });
      },

      copySelection: () => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection);
        if (sel.length === 0) return;
        const snapshot: Record<string, Item> = {};
        for (const id of sel) {
          snapshot[id] = s.items[id];
          for (const d of descendantIds(s.items, id)) snapshot[d] = s.items[d];
        }
        set({
          clipboard: {
            items: snapshot,
            tops: sel.map((id) => {
              const t = absTransform(s.items, id);
              return {
                id,
                parentId: s.items[id].parentId,
                absCenter: { x: t.cx, y: t.cy },
                absRot: t.rot,
              };
            }),
            pasteCount: 0,
          },
        });
      },

      pasteClipboard: () => {
        const s = get();
        const clip = s.clipboard;
        if (!clip || clip.tops.length === 0) return;
        const n = clip.pasteCount + 1;
        const OFFSET = 100 * n;
        const { newItems, newTopIds } = cloneSubtrees(
          clip.items,
          clip.tops.map((t) => t.id),
        );
        let items = { ...s.items, ...newItems };
        let rootIds = [...s.rootIds];
        clip.tops.forEach((top, i) => {
          const nid = newTopIds[i];
          if (!nid || !items[nid]) return;
          const parentAlive = top.parentId && s.items[top.parentId];
          if (parentAlive) {
            const it = items[nid];
            items[nid] = {
              ...it,
              parentId: top.parentId,
              x: it.x + OFFSET,
              y: it.y + OFFSET,
            };
            const p = items[top.parentId!];
            items[p.id] = { ...p, childIds: [...p.childIds, nid] };
          } else {
            items[nid] = {
              ...items[nid],
              parentId: null,
              x: top.absCenter.x + OFFSET,
              y: top.absCenter.y + OFFSET,
              rotation: normalizeDeg(top.absRot),
            };
            rootIds.push(nid);
          }
        });
        set({
          items,
          rootIds,
          selection: newTopIds,
          clipboard: { ...clip, pasteCount: n },
        });
      },

      alignSelection: (kind) => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection).filter(
          (id) => !s.items[id].locked,
        );
        if (sel.length < 2) return;
        const boxes = sel.map((id) => ({ id, box: absAABB(s.items, id) }));
        const union = unionBoxes(boxes.map((b) => b.box))!;
        const patches: Record<string, Partial<Item>> = {};
        for (const { id, box } of boxes) {
          let dx = 0;
          let dy = 0;
          switch (kind) {
            case 'left':
              dx = union.left - box.left;
              break;
            case 'hcenter':
              dx = (union.left + union.right) / 2 - (box.left + box.right) / 2;
              break;
            case 'right':
              dx = union.right - box.right;
              break;
            case 'top':
              dy = union.top - box.top;
              break;
            case 'vcenter':
              dy = (union.top + union.bottom) / 2 - (box.top + box.bottom) / 2;
              break;
            case 'bottom':
              dy = union.bottom - box.bottom;
              break;
          }
          if (dx === 0 && dy === 0) continue;
          const t = absTransform(s.items, id);
          const local = worldToLocalPoint(s.items, s.items[id].parentId, {
            x: t.cx + dx,
            y: t.cy + dy,
          });
          patches[id] = { x: local.x, y: local.y };
        }
        if (Object.keys(patches).length > 0) get().updateItems(patches);
      },

      distributeSelection: (axis) => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection).filter(
          (id) => !s.items[id].locked,
        );
        if (sel.length < 3) return;
        const entries = sel
          .map((id) => {
            const box = absAABB(s.items, id);
            return {
              id,
              center: axis === 'h' ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2,
            };
          })
          .sort((a, b) => a.center - b.center);
        const first = entries[0].center;
        const last = entries[entries.length - 1].center;
        const step = (last - first) / (entries.length - 1);
        const patches: Record<string, Partial<Item>> = {};
        entries.forEach((e, i) => {
          const target = first + step * i;
          const d = target - e.center;
          if (Math.abs(d) < 0.001) return;
          const t = absTransform(s.items, e.id);
          const local = worldToLocalPoint(s.items, s.items[e.id].parentId, {
            x: t.cx + (axis === 'h' ? d : 0),
            y: t.cy + (axis === 'v' ? d : 0),
          });
          patches[e.id] = { x: local.x, y: local.y };
        });
        if (Object.keys(patches).length > 0) get().updateItems(patches);
      },

      moveSelectedByWorld: (dx, dy) => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection).filter(
          (id) => !s.items[id].locked,
        );
        if (sel.length === 0) return;
        const patches: Record<string, Partial<Item>> = {};
        for (const id of sel) {
          const t = absTransform(s.items, id);
          const local = worldToLocalPoint(s.items, s.items[id].parentId, {
            x: t.cx + dx,
            y: t.cy + dy,
          });
          patches[id] = { x: local.x, y: local.y };
        }
        get().updateItems(patches);
      },

      // ── 선택 ──────────────────────────────────────────────
      setSelection: (ids) => set({ selection: normalizeSelection(get().items, ids) }),
      toggleSelect: (id) => {
        const s = get();
        if (s.selection.includes(id)) {
          set({ selection: s.selection.filter((x) => x !== id) });
        } else {
          set({ selection: normalizeSelection(s.items, [...s.selection, id]) });
        }
      },
      clearSelection: () => {
        if (get().selection.length > 0) set({ selection: [] });
      },
      selectAll: () => {
        const s = get();
        set({
          selection: s.rootIds.filter((id) => s.items[id]?.visible && !s.items[id]?.locked),
        });
      },
      pruneSelection: () => {
        const s = get();
        const pruned = s.selection.filter((id) => s.items[id]);
        if (pruned.length !== s.selection.length) set({ selection: pruned });
      },

      // ── 뷰/환경 ───────────────────────────────────────────
      setCamera: (cam) => set({ camera: { ...get().camera, ...cam } }),
      setContainerSize: (w, h) => set({ containerSize: { w, h } }),
      fitView: () => {
        const s = get();
        const boxes = [boothBox(s.booth), ...s.rootIds.map((id) => absAABB(s.items, id))];
        const b = unionBoxes(boxes)!;
        const pad = 300;
        const bw = b.right - b.left + pad * 2;
        const bh = b.bottom - b.top + pad * 2;
        const scale = Math.min(20, Math.max(0.005, Math.min(s.containerSize.w / bw, s.containerSize.h / bh)));
        set({
          camera: {
            scale,
            x: (s.containerSize.w - (b.right - b.left) * scale) / 2 - b.left * scale,
            y: (s.containerSize.h - (b.bottom - b.top) * scale) / 2 - b.top * scale,
          },
        });
      },
      zoomAt: (screenPt, factor) => {
        const s = get();
        const old = s.camera.scale;
        const next = Math.min(20, Math.max(0.005, old * factor));
        if (next === old) return;
        const wx = (screenPt.x - s.camera.x) / old;
        const wy = (screenPt.y - s.camera.y) / old;
        set({
          camera: { scale: next, x: screenPt.x - wx * next, y: screenPt.y - wy * next },
        });
      },
      setZoom: (scale) => {
        const s = get();
        get().zoomAt(
          { x: s.containerSize.w / 2, y: s.containerSize.h / 2 },
          scale / s.camera.scale,
        );
      },
      toggleGrid: () => set({ gridOn: !get().gridOn }),
      toggleSnap: () => set({ snapOn: !get().snapOn }),
      setGridSize: (mm) => set({ gridSize: mm }),
      toggleAutoNest: () => set({ autoNest: !get().autoNest }),
      toggleSmartGuides: () => set({ smartGuidesOn: !get().smartGuidesOn }),
      toggleDark: () => set({ dark: !get().dark }),
      setTool: (tool) => set({ tool }),
      setSpaceDown: (down) => {
        if (get().spaceDown !== down) set({ spaceDown: down });
      },
      setGuides: (guides) => set({ guides }),
      setPointer: (pt) => set({ pointer: pt }),
      setBoothDialog: (mode) => set({ boothDialog: mode }),

      // ── 즐겨찾기 / 최근 ───────────────────────────────────
      addFavoriteFromSelection: () => {
        const s = get();
        const sel = normalizeSelection(s.items, s.selection);
        if (sel.length !== 1) return;
        const topId = sel[0];
        const snapshot: Record<string, Item> = {
          [topId]: { ...s.items[topId], x: 0, y: 0, parentId: null },
        };
        for (const d of descendantIds(s.items, topId)) snapshot[d] = s.items[d];
        const fav: FavPreset = {
          id: newId(),
          name: s.items[topId].name,
          topId,
          items: snapshot,
        };
        const favorites = [...s.favorites, fav];
        saveFavorites(favorites);
        set({ favorites });
      },
      removeFavorite: (id) => {
        const favorites = get().favorites.filter((f) => f.id !== id);
        saveFavorites(favorites);
        set({ favorites });
      },
      insertFavorite: (fav) => {
        const s = get();
        const { newItems, newTopIds } = cloneSubtrees(fav.items, [fav.topId]);
        if (newTopIds.length === 0) return;
        const center = viewportCenterWorld(s);
        const nid = newTopIds[0];
        const items = { ...s.items, ...newItems };
        items[nid] = {
          ...items[nid],
          parentId: null,
          x: Math.round(center.x),
          y: Math.round(center.y),
        };
        set({ items, rootIds: [...s.rootIds, nid], selection: [nid] });
      },

      pushRecent: () => {
        const s = get();
        const doc = buildDoc(s);
        const entry: RecentEntry = {
          id: newId(),
          name: doc.name,
          ts: Date.now(),
          json: JSON.stringify(doc),
        };
        const recents = [entry, ...s.recents.filter((r) => r.name !== doc.name)].slice(0, 12);
        saveRecents(recents);
        set({ recents });
      },
      loadRecent: (id) => {
        const s = get();
        const entry = s.recents.find((r) => r.id === id);
        if (!entry) return;
        try {
          const doc = JSON.parse(entry.json) as ProjectDoc;
          get().pushRecent(); // 현재 작업을 최근 목록에 보존
          get().loadProject(doc);
          useApp.temporal.getState().clear();
        } catch {
          // 손상된 항목은 제거
          const recents = s.recents.filter((r) => r.id !== id);
          saveRecents(recents);
          set({ recents });
        }
      },
    }),
    {
      partialize: (s) => ({
        projectName: s.projectName,
        unit: s.unit,
        booth: s.booth,
        items: s.items,
        rootIds: s.rootIds,
      }),
      equality: (past, current) =>
        past.projectName === current.projectName &&
        past.unit === current.unit &&
        past.booth === current.booth &&
        past.items === current.items &&
        past.rootIds === current.rootIds,
      limit: 100,
    },
  ),
);

/** 현재 상태 → 저장용 문서 */
export function buildDoc(s: Pick<AppStore, 'projectName' | 'unit' | 'booth' | 'items' | 'rootIds'>): ProjectDoc {
  return {
    version: 1,
    name: s.projectName,
    unit: s.unit,
    booth: s.booth,
    items: s.items,
    rootIds: s.rootIds,
  };
}

export function undo(): void {
  useApp.temporal.getState().undo();
  useApp.getState().pruneSelection();
}

export function redo(): void {
  useApp.temporal.getState().redo();
  useApp.getState().pruneSelection();
}

export function pauseHistory(): void {
  useApp.temporal.getState().pause();
}

export function resumeHistory(): void {
  useApp.temporal.getState().resume();
}

export function clearHistory(): void {
  useApp.temporal.getState().clear();
}

/** 헬퍼 재노출 (컴포넌트 편의용) */
export { localToWorldPoint, worldToLocalPoint, absTransform, absAABB };
