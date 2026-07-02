import { useApp } from '../store/store';
import { fmtLen } from '../utils/units';

export function StatusBar() {
  const pointer = useApp((s) => s.pointer);
  const unit = useApp((s) => s.unit);
  const scale = useApp((s) => s.camera.scale);
  const count = useApp((s) => Object.keys(s.items).length);
  const selCount = useApp((s) => s.selection.length);

  return (
    <div className="statusbar">
      <span className="status-hint">
        휠: 확대/축소 · Space+드래그: 화면 이동 · Shift+클릭: 다중 선택 · 기물을 책상 위에 놓으면 함께 이동
      </span>
      <span className="tb-spring" />
      {pointer && (
        <span className="status-item">
          {fmtLen(pointer.x, unit)}, {fmtLen(pointer.y, unit)} {unit}
        </span>
      )}
      <span className="status-item">기물 {count}</span>
      {selCount > 0 && <span className="status-item accent">선택 {selCount}</span>}
      <span className="status-item">{Math.round(scale * 100)}%</span>
    </div>
  );
}
