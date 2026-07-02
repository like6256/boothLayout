import { CATALOG } from '../presets';
import { useApp } from '../store/store';
import { fmtLen } from '../utils/units';

/** 좌측 기물 팔레트: 클릭하면 화면 중앙에 추가 */
export function Palette() {
  const unit = useApp((s) => s.unit);
  const favorites = useApp((s) => s.favorites);

  return (
    <div className="palette">
      <div className="panel-title">기물</div>
      <div className="palette-grid">
        {CATALOG.map((c) => (
          <button
            key={c.key}
            className="palette-item"
            onClick={() => useApp.getState().addFromCatalog(c.key)}
            title={`${c.label} (${fmtLen(c.w, unit)} × ${fmtLen(c.h, unit)} ${unit})`}
          >
            <span
              className={`swatch ${c.shape === 'circle' ? 'round' : ''}`}
              style={{ background: c.color }}
            />
            <span className="palette-label">{c.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-title">
        즐겨찾기
        <span className="panel-hint">기물 선택 후 속성에서 추가</span>
      </div>
      <div className="fav-list">
        {favorites.length === 0 && (
          <div className="empty-note">저장된 프리셋이 없습니다</div>
        )}
        {favorites.map((f) => (
          <div key={f.id} className="fav-row">
            <button
              className="fav-insert"
              onClick={() => useApp.getState().insertFavorite(f)}
              title="캔버스에 추가"
            >
              {f.name}
            </button>
            <button
              className="fav-del"
              onClick={() => useApp.getState().removeFavorite(f.id)}
              title="즐겨찾기에서 삭제"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="palette-tip">
        💡 기물을 책상 위로 끌어놓으면 자동으로 얹혀서 함께 움직입니다.
      </div>
    </div>
  );
}
