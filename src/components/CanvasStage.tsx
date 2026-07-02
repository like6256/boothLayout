import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pauseHistory, resumeHistory, useApp } from '../store/store';
import type { Item } from '../types';
import { CanvasStage2D } from './CanvasStage2D';
import {
  absAABB,
  absTransform,
  descendantIds,
  findDropTarget,
  localToWorldPoint,
  worldToLocalPoint,
  type Box,
  type Pt,
} from '../utils/geometry';
import { getItemHeight } from '../utils/dimensions';

interface DragState {
  id: string;
  startPoint: THREE.Vector3;
  itemStart: { x: number; y: number };
  absRot: number;
}

function supportHeight(items: Record<string, Item>, id: string): number {
  const item = items[id];
  if (!item?.parentId || !items[item.parentId]) return 0;
  const parent = items[item.parentId];
  if (parent.type === 'group') return supportHeight(items, parent.id);
  return supportHeight(items, parent.id) + getItemHeight(parent);
}

function itemWorldHalfExtents(item: Item, absRot: number): { x: number; y: number } {
  const r = THREE.MathUtils.degToRad(absRot);
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    x: (item.w / 2) * c + (item.h / 2) * s,
    y: (item.w / 2) * s + (item.h / 2) * c,
  };
}

function nearestWithin(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const candidate of candidates) {
    const dist = Math.abs(value - candidate);
    if (dist <= bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function snapToSupportEdges(
  items: Record<string, Item>,
  movingId: string,
  supportId: string | null,
  worldCenter: Pt,
  threshold: number,
): Pt {
  if (!supportId || supportId === movingId || !items[supportId] || !items[movingId]) {
    return worldCenter;
  }
  const moving = items[movingId];
  const support = absAABB(items, supportId);
  const rot = absTransform(items, movingId).rot;
  const half = itemWorldHalfExtents(moving, rot);
  return {
    x: nearestWithin(
      worldCenter.x,
      [
        support.left + half.x,
        support.right - half.x,
        support.left - half.x,
        support.right + half.x,
      ],
      threshold,
    ),
    y: nearestWithin(
      worldCenter.y,
      [
        support.top + half.y,
        support.bottom - half.y,
        support.top - half.y,
        support.bottom + half.y,
      ],
      threshold,
    ),
  };
}

function samePoint(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function snapPointToGrid(pt: Pt, gridSize: number): Pt {
  return {
    x: Math.round(pt.x / gridSize) * gridSize,
    y: Math.round(pt.y / gridSize) * gridSize,
  };
}

function projectedBox(item: Item, center: Pt, absRot: number): Box {
  const half = itemWorldHalfExtents(item, absRot);
  return {
    left: center.x - half.x,
    right: center.x + half.x,
    top: center.y - half.y,
    bottom: center.y + half.y,
  };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function pushOutOfBox(center: Pt, moving: Box, fixed: Box): Pt {
  const pushLeft = fixed.left - moving.right;
  const pushRight = fixed.right - moving.left;
  const pushTop = fixed.top - moving.bottom;
  const pushBottom = fixed.bottom - moving.top;
  const options = [
    { dx: pushLeft, dy: 0, d: Math.abs(pushLeft) },
    { dx: pushRight, dy: 0, d: Math.abs(pushRight) },
    { dx: 0, dy: pushTop, d: Math.abs(pushTop) },
    { dx: 0, dy: pushBottom, d: Math.abs(pushBottom) },
  ].sort((a, b) => a.d - b.d);
  return { x: center.x + options[0].dx, y: center.y + options[0].dy };
}

function collisionIds(items: Record<string, Item>, rootIds: string[], movingId: string): string[] {
  const blocked = new Set([movingId, ...descendantIds(items, movingId)]);
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const item = items[id];
      if (!item || blocked.has(id) || !item.visible) continue;
      if (item.type !== 'group') out.push(id);
      walk(item.childIds);
    }
  };
  walk(rootIds);
  return out;
}

function resolveFootprintCollisions(
  items: Record<string, Item>,
  rootIds: string[],
  movingId: string,
  worldCenter: Pt,
  topTargetId: string | null,
): Pt {
  const item = items[movingId];
  if (!item) return worldCenter;
  const ids = collisionIds(items, rootIds, movingId);
  const absRot = absTransform(items, movingId).rot;
  let center = worldCenter;

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const id of ids) {
      if (id === topTargetId) continue;
      const fixed = absAABB(items, id);
      const moving = projectedBox(item, center, absRot);
      if (!boxesOverlap(moving, fixed)) continue;
      center = pushOutOfBox(center, moving, fixed);
      changed = true;
    }
    if (!changed) break;
  }
  return center;
}

function degToRad(deg: number | undefined): number {
  return THREE.MathUtils.degToRad(deg ?? 0);
}

function bottomYAfterRotation(item: Item, height: number): number {
  const geometry =
    item.shape === 'circle'
      ? new THREE.CylinderGeometry(item.w / 2, item.w / 2, height, 16)
      : new THREE.BoxGeometry(item.w, height, item.h);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(degToRad(item.pitch), -degToRad(item.rotation), degToRad(item.roll), 'YXZ'),
  );
  const pos = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let minY = Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    minY = Math.min(minY, v.y);
  }
  geometry.dispose();
  return minY;
}

function verticalCenterForFloor(items: Record<string, Item>, item: Item, id: string, height: number): number {
  const baseY = supportHeight(items, id);
  return Math.max(baseY + height / 2, baseY - bottomYAfterRotation(item, height));
}

function colorWithAlpha(hex: string, alpha: number): THREE.Color {
  const color = new THREE.Color(/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#b8bfc7');
  return color.lerp(new THREE.Color('#ffffff'), 1 - alpha);
}

function makeItemMaterial(item: Item): THREE.Material {
  if (item.imageSrc) {
    return new THREE.MeshStandardMaterial({
      color: '#f5f5f5',
      roughness: 0.72,
      metalness: 0.02,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: colorWithAlpha(item.color, item.locked ? 0.55 : 1),
    roughness: 0.62,
    metalness: 0.04,
    transparent: item.type === 'group',
    opacity: item.type === 'group' ? 0.12 : item.locked ? 0.64 : 1,
  });
}

function makeImagePlane(item: Item, h: number): THREE.Mesh | null {
  if (!item.imageSrc) return null;
  const texture = new THREE.TextureLoader().load(item.imageSrc);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(item.w, item.h), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = h / 2 + 2;
  plane.userData.itemId = item.id;
  return plane;
}

function makeLabel(text: string, dark: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 52px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = dark ? 'rgba(15,18,24,0.78)' : 'rgba(255,255,255,0.82)';
  ctx.fillStyle = dark ? '#f4f7fb' : '#20242b';
  const label = text.length > 16 ? `${text.slice(0, 15)}...` : text;
  ctx.strokeText(label, canvas.width / 2, canvas.height / 2);
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(420, 130, 1);
  return sprite;
}

function CanvasStage3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const objectLayerRef = useRef<THREE.Group | null>(null);
  const objectMapRef = useRef(new Map<string, THREE.Object3D>());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const dragRef = useRef<DragState | null>(null);
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const items = useApp((s) => s.items);
  const rootIds = useApp((s) => s.rootIds);
  const selection = useApp((s) => s.selection);
  const booth = useApp((s) => s.booth);
  const gridOn = useApp((s) => s.gridOn);
  const gridSize = useApp((s) => s.gridSize);
  const dark = useApp((s) => s.dark);
  const tool = useApp((s) => s.tool);
  const spaceDown = useApp((s) => s.spaceDown);
  const cameraState = useApp((s) => s.camera);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? '#191c22' : '#e9ebef');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 200000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 500;
    controls.maxDistance = 80000;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(dark ? '#dbe8ff' : '#ffffff', '#9098a5', 1.9));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(-3500, 6000, 3000);
    sun.castShadow = true;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 20000;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const objectLayer = new THREE.Group();
    objectLayerRef.current = objectLayer;
    scene.add(objectLayer);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      useApp.getState().setContainerSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) scene.background = new THREE.Color(dark ? '#191c22' : '#e9ebef');
  }, [dark]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const cx = booth.w / 2;
    const cz = booth.h / 2;
    const span = Math.max(booth.w, booth.h, 1000);
    const zoom = Math.max(0.005, cameraState.scale);
    const dist = THREE.MathUtils.clamp((span * 1.8) / zoom, 1200, 80000);
    controls.target.set(0, 0, 0);
    camera.position.set(cx - booth.w / 2 + dist * 0.55, dist * 0.58, cz - booth.h / 2 + dist * 0.8);
    camera.lookAt(controls.target);
    controls.update();
  }, [booth.w, booth.h, cameraState.scale]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const panActive = tool === 'pan' || spaceDown;
    controls.enableRotate = panActive;
    controls.enablePan = true;
    controls.mouseButtons.LEFT = panActive ? THREE.MOUSE.ROTATE : null;
  }, [tool, spaceDown]);

  useEffect(() => {
    const layer = objectLayerRef.current;
    if (!layer) return;
    layer.clear();
    objectMapRef.current.clear();

    const floorMat = new THREE.MeshStandardMaterial({
      color: dark ? '#242934' : '#ffffff',
      roughness: 0.86,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(booth.w, 18, booth.h), floorMat);
    floor.position.set(0, -9, 0);
    floor.receiveShadow = true;
    layer.add(floor);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(booth.w, 20, booth.h)),
      new THREE.LineBasicMaterial({ color: dark ? '#f1f5fb' : '#1f242e' }),
    );
    border.position.copy(floor.position);
    layer.add(border);

    if (gridOn) {
      const divisions = Math.max(2, Math.ceil(Math.max(booth.w, booth.h) / gridSize));
      const helper = new THREE.GridHelper(Math.max(booth.w, booth.h), divisions, dark ? '#536070' : '#a8b0bc', dark ? '#343b46' : '#d1d6dd');
      helper.position.y = 2;
      layer.add(helper);
    }

    const selected = new Set(selection);
    const addItem = (id: string) => {
      const item = items[id];
      if (!item || !item.visible) return;
      const t = absTransform(items, id);
      const h = getItemHeight(item);
      const x = t.cx - booth.w / 2;
      const z = t.cy - booth.h / 2;
      const y = verticalCenterForFloor(items, item, id, h);

      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.order = 'YXZ';
      group.rotation.set(degToRad(item.pitch), -THREE.MathUtils.degToRad(t.rot), degToRad(item.roll), 'YXZ');
      group.userData.itemId = id;

      const mat = makeItemMaterial(item);
      const geometry =
        item.shape === 'circle'
          ? new THREE.CylinderGeometry(item.w / 2, item.w / 2, h, 48)
          : new THREE.BoxGeometry(item.w, h, item.h);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = item.type !== 'group';
      mesh.receiveShadow = true;
      mesh.userData.itemId = id;
      group.add(mesh);

      const imagePlane = makeImagePlane(item, h);
      if (imagePlane) group.add(imagePlane);

      const edgeColor = selected.has(id) ? (dark ? '#7ab5ff' : '#2563eb') : dark ? '#6d7480' : '#58606c';
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: edgeColor }),
      );
      edges.userData.itemId = id;
      group.add(edges);

      if (!item.imageSrc && item.type !== 'group' && item.w > 130 && item.h > 130) {
        const label = makeLabel(item.name, dark);
        label.position.set(0, h / 2 + 90, 0);
        group.add(label);
      }

      objectMapRef.current.set(id, group);
      layer.add(group);
      for (const childId of item.childIds) addItem(childId);
    };

    for (const id of rootIds) addItem(id);
  }, [items, rootIds, selection, booth, gridOn, gridSize, dark]);

  const setPointerFromEvent = (event: PointerEvent) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const pt = new THREE.Vector3();
    if (!raycasterRef.current.ray.intersectPlane(planeRef.current, pt)) return null;
    useApp.getState().setPointer({ x: pt.x + booth.w / 2, y: pt.z + booth.h / 2 });
    return pt;
  };

  const pickItem = () => {
    const objects = [...objectMapRef.current.values()];
    const hits = raycasterRef.current.intersectObjects(objects, true);
    const hit = hits.find((h) => h.object.userData.itemId);
    return hit?.object.userData.itemId as string | undefined;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || tool === 'pan' || spaceDown) return;
    const pt = setPointerFromEvent(event.nativeEvent);
    const id = pickItem();
    const st = useApp.getState();
    if (!id) {
      st.clearSelection();
      return;
    }
    const item = st.items[id];
    if (!item || item.locked) return;
    if (event.shiftKey || event.ctrlKey) st.toggleSelect(id);
    else if (!st.selection.includes(id)) st.setSelection([id]);
    if (!pt) return;
    const startAbs = absTransform(st.items, id);
    pauseHistory();
    dragRef.current = {
      id,
      startPoint: pt.clone(),
      itemStart: { x: item.x, y: item.y },
      absRot: startAbs.rot,
    };
    controlsRef.current!.enabled = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pt = setPointerFromEvent(event.nativeEvent);
    const drag = dragRef.current;
    if (!pt || !drag) return;
    const st = useApp.getState();
    const dx = pt.x - drag.startPoint.x;
    const dy = pt.z - drag.startPoint.z;
    const g = st.gridSize;
    const item = st.items[drag.id];
    if (!item) return;

    const desiredLocal: Pt = {
      x: drag.itemStart.x + dx,
      y: drag.itemStart.y + dy,
    };
    let localNext = st.snapOn ? snapPointToGrid(desiredLocal, g) : desiredLocal;
    let desiredWorld = localToWorldPoint(st.items, item.parentId, desiredLocal);
    let topTarget = findDropTarget(st.items, st.rootIds, desiredWorld, [drag.id]);

    if (st.snapOn) {
      const support =
        topTarget ??
        (item.parentId && st.items[item.parentId] ? item.parentId : null);
      const snappedWorld = snapToSupportEdges(
        st.items,
        drag.id,
        support,
        desiredWorld,
        Math.max(8, Math.min(32, st.gridSize * 0.25)),
      );
      if (!samePoint(snappedWorld, desiredWorld)) {
        localNext = worldToLocalPoint(st.items, item.parentId, snappedWorld);
      }
    }

    desiredWorld = localToWorldPoint(st.items, item.parentId, localNext);
    topTarget = findDropTarget(st.items, st.rootIds, desiredWorld, [drag.id]);
    const resolvedWorld = resolveFootprintCollisions(
      st.items,
      st.rootIds,
      drag.id,
      desiredWorld,
      topTarget,
    );
    if (!samePoint(resolvedWorld, desiredWorld)) {
      localNext = worldToLocalPoint(st.items, item.parentId, resolvedWorld);
    }

    st.updateItems({ [drag.id]: localNext });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const st = useApp.getState();
    const item = st.items[drag.id];
    if (item) {
      const finalPos = { x: item.x, y: item.y };
      const finalWorld = absTransform(st.items, drag.id);
      st.updateItems({ [drag.id]: drag.itemStart });
      resumeHistory();

      const target =
        st.autoNest && item.type !== 'group'
          ? findDropTarget(st.items, st.rootIds, { x: finalWorld.cx, y: finalWorld.cy }, [drag.id])
          : null;
      const currentParent = item.parentId && st.items[item.parentId] ? item.parentId : null;
      st.commitDrag({
        positions: { [drag.id]: finalPos },
        reparent:
          target !== currentParent
            ? {
                id: drag.id,
                parentId: target,
                world: { x: finalWorld.cx, y: finalWorld.cy },
                absRot: drag.absRot,
              }
            : undefined,
      });
    } else {
      resumeHistory();
    }
    controlsRef.current!.enabled = true;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className={`canvas-wrap ${tool === 'pan' || spaceDown ? 'panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

export function CanvasStage() {
  const viewMode = useApp((s) => s.viewMode);
  return viewMode === '2d' ? <CanvasStage2D /> : <CanvasStage3D />;
}
