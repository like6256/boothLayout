import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useApp } from '../store/store';
import { ObjectNode } from './ObjectNode';
import { GridAndBooth } from './GridLayer';
import { Minimap } from './Minimap';
import { absAABB, boxesIntersect, unionBoxes, type Box } from '../utils/geometry';
import { fmtLen } from '../utils/units';

Konva.dragDistance = 4;

interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function CanvasStage2D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const panRef = useRef<{ sx: number; sy: number; camX: number; camY: number } | null>(null);
  const pointerRaf = useRef(0);
  const fitted = useRef(false);

  const rootIds = useApp((s) => s.rootIds);
  const items = useApp((s) => s.items);
  const selection = useApp((s) => s.selection);
  const camera = useApp((s) => s.camera);
  const size = useApp((s) => s.containerSize);
  const guides = useApp((s) => s.guides);
  const dark = useApp((s) => s.dark);
  const unit = useApp((s) => s.unit);
  const tool = useApp((s) => s.tool);
  const spaceDown = useApp((s) => s.spaceDown);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const panActive = tool === 'pan' || spaceDown;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => useApp.getState().setContainerSize(el.clientWidth, el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitted.current && size.w > 50) {
      fitted.current = true;
      useApp.getState().fitView();
    }
  }, [size.w]);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selection
      .filter((id) => {
        const it = items[id];
        return it && !it.locked && it.visible;
      })
      .map((id) => stage.findOne('#' + id))
      .filter((n): n is Konva.Group => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, items]);

  const finishMarquee = () => {
    const m = marqueeRef.current;
    if (!m) return;
    marqueeRef.current = null;
    setMarquee(null);
    const st = useApp.getState();
    const box: Box = {
      left: Math.min(m.x1, m.x2),
      right: Math.max(m.x1, m.x2),
      top: Math.min(m.y1, m.y2),
      bottom: Math.max(m.y1, m.y2),
    };
    const tiny =
      box.right - box.left < 3 / st.camera.scale &&
      box.bottom - box.top < 3 / st.camera.scale;
    if (tiny) {
      st.clearSelection();
      return;
    }
    const hit = st.rootIds.filter((id) => {
      const it = st.items[id];
      if (!it || !it.visible || it.locked) return false;
      return boxesIntersect(box, absAABB(st.items, id));
    });
    st.setSelection(hit);
  };

  useEffect(() => {
    const onUp = () => finishMarquee();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toWorld = (p: { x: number; y: number }) => {
    const st = useApp.getState();
    return {
      x: (p.x - st.camera.x) / st.camera.scale,
      y: (p.y - st.camera.y) / st.camera.scale,
    };
  };

  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      const st = useApp.getState();
      panRef.current = {
        sx: e.evt.clientX,
        sy: e.evt.clientY,
        camX: st.camera.x,
        camY: st.camera.y,
      };
      return;
    }
    if (e.target !== stage) return;
    if (panActive || e.evt.button !== 0) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const w = toWorld(p);
    marqueeRef.current = { x1: w.x, y1: w.y, x2: w.x, y2: w.y };
    setMarquee(marqueeRef.current);
  };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const w = toWorld(p);
    if (marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, x2: w.x, y2: w.y };
      setMarquee(marqueeRef.current);
    }
    if (!pointerRaf.current) {
      pointerRaf.current = requestAnimationFrame(() => {
        pointerRaf.current = 0;
        useApp.getState().setPointer(w);
      });
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pan = panRef.current;
      if (!pan) return;
      useApp.getState().setCamera({
        x: pan.camX + (e.clientX - pan.sx),
        y: pan.camY + (e.clientY - pan.sy),
      });
    };
    const onUp = () => {
      panRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    useApp.getState().zoomAt(p, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
  };

  const onStageDragMove = (e: KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage || e.target !== stage) return;
    useApp.getState().setCamera({ x: stage.x(), y: stage.y() });
  };

  const handleTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const st = useApp.getState();
    const patches: Record<string, Partial<{ x: number; y: number; w: number; h: number; rotation: number }>> = {};
    for (const node of tr.nodes() as Konva.Group[]) {
      const id = node.id();
      const it = st.items[id];
      if (!it) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      patches[id] = {
        x: node.x(),
        y: node.y(),
        w: Math.max(10, it.w * Math.abs(sx)),
        h: Math.max(10, it.h * Math.abs(sy)),
        rotation: node.rotation(),
      };
    }
    if (Object.keys(patches).length > 0) st.updateItems(patches);
  };

  const selBoxInfo = useMemo(() => {
    const tops = selection.filter((id) => items[id]);
    if (tops.length === 0) return null;
    const boxes = tops.map((id) => absAABB(items, id));
    const u = unionBoxes(boxes);
    if (!u) return null;
    if (tops.length === 1) {
      const it = items[tops[0]];
      return { box: u, w: it.w, h: it.h };
    }
    return { box: u, w: u.right - u.left, h: u.bottom - u.top };
  }, [selection, items]);

  const accent = dark ? '#7ab5ff' : '#2563eb';
  const guideColor = '#e11d8f';

  return (
    <div
      ref={containerRef}
      className={`canvas-wrap ${panActive ? 'panning' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={camera.x}
        y={camera.y}
        scaleX={camera.scale}
        scaleY={camera.scale}
        draggable={panActive}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={finishMarquee}
        onWheel={onWheel}
        onDragMove={onStageDragMove}
        onDragEnd={onStageDragMove}
      >
        <Layer listening={false}>
          <GridAndBooth />
        </Layer>
        <Layer listening={!panActive}>
          {rootIds.map((id) => (
            <ObjectNode key={id} id={id} />
          ))}
        </Layer>
        <Layer>
          {guides.map((g, i) => (
            <Line
              key={i}
              points={g.points}
              stroke={guideColor}
              strokeWidth={1}
              strokeScaleEnabled={false}
              dash={[6 / camera.scale, 4 / camera.scale]}
              listening={false}
            />
          ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill={dark ? 'rgba(122,181,255,0.12)' : 'rgba(37,99,235,0.10)'}
              stroke={accent}
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
            />
          )}
          {selBoxInfo && (
            <Text
              x={selBoxInfo.box.left}
              y={selBoxInfo.box.bottom + 10 / camera.scale}
              width={selBoxInfo.box.right - selBoxInfo.box.left}
              align="center"
              text={`${fmtLen(selBoxInfo.w, unit)} x ${fmtLen(selBoxInfo.h, unit)} ${unit}`}
              fontSize={13 / camera.scale}
              fill={accent}
              listening={false}
            />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={6}
            keepRatio={false}
            flipEnabled={false}
            ignoreStroke
            anchorSize={9}
            anchorCornerRadius={3}
            anchorStroke={accent}
            anchorFill={dark ? '#20242c' : '#ffffff'}
            borderStroke={accent}
            onTransformEnd={handleTransformEnd}
            boundBoxFunc={(oldBox, newBox) =>
              Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>
      <Minimap />
    </div>
  );
}
