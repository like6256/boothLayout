import { memo, useEffect, useRef, useState } from 'react';
import { Circle, Ellipse, Group, Image as KonvaImage, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { GuideLine } from '../types';
import { pauseHistory, resumeHistory, useApp } from '../store/store';
import {
  absAABB,
  absTransform,
  clickTargetFor,
  findDropTarget,
  hasGroupAncestor,
  localToWorldPoint,
  worldToLocalPoint,
  type Box,
  type Pt,
} from '../utils/geometry';
import { computeSmartGuides } from '../utils/guides';

interface DragCtx {
  dragIds: string[];
  otherIds: string[];
  startLocal: Record<string, Pt>;
  startAbsOthers: Record<string, Pt>;
  myStartAbs: Pt;
  myAbsRot: number;
  myBox: Box;
  guides: GuideLine[];
}

function labelColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#222';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#222222' : '#ffffff';
}

function useLoadedImage(src?: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);
  return image;
}

export const ObjectNode = memo(function ObjectNode({ id }: { id: string }) {
  const item = useApp((s) => s.items[id]);
  const selected = useApp((s) => s.selection.includes(id));
  const dark = useApp((s) => s.dark);
  const groupMember = useApp((s) => hasGroupAncestor(s.items, id));
  const ctx = useRef<DragCtx | null>(null);
  const rafRef = useRef(0);
  const image = useLoadedImage(item?.imageSrc);

  if (!item) return null;

  const isGroup = item.type === 'group';

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    e.cancelBubble = true;
    const st = useApp.getState();
    if (st.spaceDown || st.tool === 'pan') return;
    if (item.locked) return;
    const target = clickTargetFor(st.items, id);
    if (e.evt.shiftKey || e.evt.ctrlKey) {
      st.toggleSelect(target);
    } else if (!st.selection.includes(target)) {
      st.setSelection([target]);
    }
  };

  const onDragStart = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const st = useApp.getState();
    pauseHistory();
    const sel = st.selection.includes(id) ? st.selection : [id];
    const dragIds = sel.filter((s) => st.items[s] && !st.items[s].locked);
    const otherIds = dragIds.filter((s) => s !== id);
    const startLocal: Record<string, Pt> = {};
    const startAbsOthers: Record<string, Pt> = {};
    for (const s of dragIds) {
      startLocal[s] = { x: st.items[s].x, y: st.items[s].y };
    }
    for (const s of otherIds) {
      const t = absTransform(st.items, s);
      startAbsOthers[s] = { x: t.cx, y: t.cy };
    }
    const myT = absTransform(st.items, id);
    ctx.current = {
      dragIds,
      otherIds,
      startLocal,
      startAbsOthers,
      myStartAbs: { x: myT.cx, y: myT.cy },
      myAbsRot: myT.rot,
      myBox: absAABB(st.items, id),
      guides: [],
    };
  };

  /** 절대(화면) 좌표 → 월드 좌표로 스냅/가이드 적용 후 되돌린다 */
  const dragBoundFunc = (pos: Konva.Vector2d): Konva.Vector2d => {
    const c = ctx.current;
    const st = useApp.getState();
    if (!c) return pos;
    const { camera } = st;
    let wx = (pos.x - camera.x) / camera.scale;
    let wy = (pos.y - camera.y) / camera.scale;

    if (st.snapOn) {
      const g = st.gridSize;
      const rot = ((c.myAbsRot % 180) + 180) % 180;
      const axisAligned = rot < 0.01 || Math.abs(rot - 90) < 0.01 || Math.abs(rot - 180) < 0.01;
      if (axisAligned) {
        // 회전 0/90/180/270 → 좌상단 모서리를 그리드에 스냅
        const swap = Math.abs(rot - 90) < 0.01;
        const ew = swap ? item.h : item.w;
        const eh = swap ? item.w : item.h;
        wx = Math.round((wx - ew / 2) / g) * g + ew / 2;
        wy = Math.round((wy - eh / 2) / g) * g + eh / 2;
      } else {
        wx = Math.round(wx / g) * g;
        wy = Math.round(wy / g) * g;
      }
    }

    if (st.smartGuidesOn) {
      const res = computeSmartGuides(
        st.items,
        st.rootIds,
        st.booth,
        c.dragIds,
        c.myBox,
        c.myStartAbs,
        { x: wx, y: wy },
        6 / camera.scale,
      );
      wx += res.dx;
      wy += res.dy;
      c.guides = res.guides;
    } else {
      c.guides = [];
    }
    return { x: wx * camera.scale + camera.x, y: wy * camera.scale + camera.y };
  };

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const c = ctx.current;
    if (!c) return;
    const node = e.target as Konva.Group;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const st = useApp.getState();
      st.setGuides(c.guides);
      if (c.otherIds.length > 0) {
        const local = node.position();
        const worldNow = localToWorldPoint(st.items, item.parentId, local);
        const dx = worldNow.x - c.myStartAbs.x;
        const dy = worldNow.y - c.myStartAbs.y;
        const patches: Record<string, Partial<{ x: number; y: number }>> = {};
        for (const oid of c.otherIds) {
          const it = st.items[oid];
          if (!it) continue;
          const start = c.startAbsOthers[oid];
          const local2 = worldToLocalPoint(st.items, it.parentId, {
            x: start.x + dx,
            y: start.y + dy,
          });
          patches[oid] = { x: local2.x, y: local2.y };
        }
        st.updateItems(patches);
      }
    });
  };

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const c = ctx.current;
    ctx.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (!c) return;
    const st = useApp.getState();
    const node = e.target as Konva.Group;
    const localEnd = node.position();
    const worldEnd = localToWorldPoint(st.items, item.parentId, localEnd);
    const dx = worldEnd.x - c.myStartAbs.x;
    const dy = worldEnd.y - c.myStartAbs.y;

    // 1) 시작 위치로 조용히 복원 → undo 한 번에 드래그 전체가 되돌아가도록
    const restore: Record<string, Partial<{ x: number; y: number }>> = {};
    for (const [sid, p] of Object.entries(c.startLocal)) restore[sid] = { x: p.x, y: p.y };
    st.updateItems(restore);
    resumeHistory();

    // 2) 최종 위치를 한 번의 set으로 커밋
    const positions: Record<string, { x: number; y: number }> = {
      [id]: { x: localEnd.x, y: localEnd.y },
    };
    for (const oid of c.otherIds) {
      const it = st.items[oid];
      if (!it) continue;
      const start = c.startAbsOthers[oid];
      const local2 = worldToLocalPoint(st.items, it.parentId, {
        x: start.x + dx,
        y: start.y + dy,
      });
      positions[oid] = { x: local2.x, y: local2.y };
    }

    let reparent: { id: string; parentId: string | null; world: Pt; absRot: number } | undefined;
    if (st.autoNest) {
      const target = findDropTarget(st.items, st.rootIds, worldEnd, c.dragIds);
      const curParent = item.parentId && st.items[item.parentId] ? item.parentId : null;
      if ((target ?? null) !== curParent) {
        reparent = { id, parentId: target, world: worldEnd, absRot: c.myAbsRot };
      }
    }
    st.commitDrag({ positions, reparent });
  };

  // 라벨: 기물 크기에 맞을 때만 표시
  const nameLen = Math.max(1, item.name.length);
  const fontSize = Math.min(item.h * 0.38, (item.w * 0.9) / (nameLen * 0.62), 120);
  const showLabel = !isGroup && fontSize >= 18;

  const baseStroke = dark ? 'rgba(255,255,255,0.4)' : 'rgba(20,20,30,0.4)';
  const selStroke = dark ? '#7ab5ff' : '#2563eb';

  return (
    <Group
      id={id}
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      offsetX={item.w / 2}
      offsetY={item.h / 2}
      visible={item.visible}
      listening={!groupMember}
      draggable={!item.locked && !groupMember}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onMouseDown}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {isGroup ? (
        <Rect
          width={item.w}
          height={item.h}
          fill={selected ? 'rgba(99,130,255,0.10)' : 'rgba(99,130,255,0.04)'}
          stroke={selected ? selStroke : baseStroke}
          strokeWidth={selected ? 1.6 : 1}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          listening={!item.locked}
          perfectDrawEnabled={false}
        />
      ) : item.imageSrc ? (
        <>
          <Rect
            width={item.w}
            height={item.h}
            cornerRadius={Math.min(10, item.w / 10, item.h / 10)}
            fill="#ffffff"
            stroke={selected ? selStroke : baseStroke}
            strokeWidth={selected ? 2 : 1}
            strokeScaleEnabled={false}
            listening={!item.locked}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
          {image && (
            <KonvaImage
              image={image}
              width={item.w}
              height={item.h}
              listening={!item.locked}
              perfectDrawEnabled={false}
            />
          )}
        </>
      ) : item.shape === 'circle' ? (
        <Ellipse
          x={item.w / 2}
          y={item.h / 2}
          radiusX={item.w / 2}
          radiusY={item.h / 2}
          fill={item.color}
          stroke={selected ? selStroke : baseStroke}
          strokeWidth={selected ? 2 : 1}
          strokeScaleEnabled={false}
          listening={!item.locked}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      ) : (
        <Rect
          width={item.w}
          height={item.h}
          cornerRadius={Math.min(10, item.w / 10, item.h / 10)}
          fill={item.color}
          stroke={selected ? selStroke : baseStroke}
          strokeWidth={selected ? 2 : 1}
          strokeScaleEnabled={false}
          listening={!item.locked}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />
      )}
      {showLabel && (
        <Text
          width={item.w}
          height={item.h}
          text={item.name}
          fontSize={fontSize}
          fontFamily="system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif"
          fill={labelColor(item.color)}
          align="center"
          verticalAlign="middle"
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {item.memo && Math.min(item.w, item.h) > 100 && (
        <Circle
          x={item.w - 26}
          y={26}
          radius={16}
          fill="#f59e0b"
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {item.locked && Math.min(item.w, item.h) > 100 && (
        <Circle
          x={26}
          y={26}
          radius={16}
          fill={dark ? '#666' : '#999'}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {item.childIds.map((cid) => (
        <ObjectNode key={cid} id={cid} />
      ))}
    </Group>
  );
});
