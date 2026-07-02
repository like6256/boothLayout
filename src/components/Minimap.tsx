import { useMemo } from 'react';
import { useApp } from '../store/store';
import { absAABB, boothBox, unionBoxes } from '../utils/geometry';

const MAP_W = 190;
const MAP_H = 140;

/** 우하단 미니맵: 전체 배치와 현재 뷰포트를 보여주고, 클릭하면 그 지점으로 이동 */
export function Minimap() {
  const items = useApp((s) => s.items);
  const rootIds = useApp((s) => s.rootIds);
  const booth = useApp((s) => s.booth);
  const camera = useApp((s) => s.camera);
  const size = useApp((s) => s.containerSize);
  const dark = useApp((s) => s.dark);

  const bounds = useMemo(() => {
    const boxes = [boothBox(booth), ...rootIds.map((id) => absAABB(items, id))];
    const b = unionBoxes(boxes)!;
    const pad = Math.max(200, (b.right - b.left) * 0.06);
    return {
      left: b.left - pad,
      top: b.top - pad,
      right: b.right + pad,
      bottom: b.bottom + pad,
    };
  }, [items, rootIds, booth]);

  const bw = bounds.right - bounds.left;
  const bh = bounds.bottom - bounds.top;

  const flat = useMemo(() => {
    const out: { id: string; box: ReturnType<typeof absAABB>; color: string }[] = [];
    const walk = (ids: string[]) => {
      for (const id of ids) {
        const it = items[id];
        if (!it || !it.visible) continue;
        if (it.type !== 'group') {
          out.push({ id, box: absAABB(items, id), color: it.color });
        }
        walk(it.childIds);
      }
    };
    walk(rootIds);
    return out;
  }, [items, rootIds]);

  // 현재 화면이 보는 월드 영역
  const view = {
    x: -camera.x / camera.scale,
    y: -camera.y / camera.scale,
    w: size.w / camera.scale,
    h: size.h / camera.scale,
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // preserveAspectRatio(meet) 보정
    const k = Math.min(rect.width / bw, rect.height / bh);
    const offX = (rect.width - bw * k) / 2;
    const offY = (rect.height - bh * k) / 2;
    const wx = bounds.left + (e.clientX - rect.left - offX) / k;
    const wy = bounds.top + (e.clientY - rect.top - offY) / k;
    const st = useApp.getState();
    st.setCamera({
      x: st.containerSize.w / 2 - wx * st.camera.scale,
      y: st.containerSize.h / 2 - wy * st.camera.scale,
    });
  };

  return (
    <svg
      className="minimap"
      width={MAP_W}
      height={MAP_H}
      viewBox={`${bounds.left} ${bounds.top} ${bw} ${bh}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onClick}
    >
      <rect
        x={bounds.left}
        y={bounds.top}
        width={bw}
        height={bh}
        fill={dark ? '#1a1d23' : '#eef0f4'}
      />
      <rect
        x={0}
        y={0}
        width={booth.w}
        height={booth.h}
        fill={dark ? '#262b34' : '#ffffff'}
        stroke={dark ? '#aab' : '#333'}
        strokeWidth={bw / 120}
      />
      {flat.map(({ id, box, color }) => (
        <rect
          key={id}
          x={box.left}
          y={box.top}
          width={Math.max(1, box.right - box.left)}
          height={Math.max(1, box.bottom - box.top)}
          fill={color}
          opacity={0.85}
        />
      ))}
      <rect
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="none"
        stroke={dark ? '#7ab5ff' : '#2563eb'}
        strokeWidth={bw / 90}
      />
    </svg>
  );
}
