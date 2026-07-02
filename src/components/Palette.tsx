import type { ChangeEvent } from 'react';
import { CATALOG } from '../presets';
import { useApp } from '../store/store';
import { newId } from '../utils/id';
import { fmtLen } from '../utils/units';

interface ImageAsset {
  name: string;
  src: string;
  w: number;
  h: number;
}

function clampSize(v: number): number {
  return Math.min(50000, Math.max(10, v));
}

function addImageAsset(asset: ImageAsset): void {
  const st = useApp.getState();
  if (typeof st.addImageAsset === 'function') {
    st.addImageAsset(asset);
    return;
  }

  const g = st.gridSize;
  const center = {
    x: (st.containerSize.w / 2 - st.camera.x) / st.camera.scale,
    y: (st.containerSize.h / 2 - st.camera.y) / st.camera.scale,
  };
  const x = st.snapOn ? Math.round(center.x / g) * g : Math.round(center.x);
  const y = st.snapOn ? Math.round(center.y / g) * g : Math.round(center.y);
  const id = newId();
  const w = clampSize(asset.w);
  const h = clampSize(asset.h);
  useApp.setState({
    items: {
      ...st.items,
      [id]: {
        id,
        type: 'image',
        shape: 'rect',
        name: asset.name || '이미지',
        x,
        y,
        w,
        h,
        height: 20,
        imageSrc: asset.src,
        rotation: 0,
        pitch: 0,
        roll: 0,
        color: '#ffffff',
        memo: '',
        parentId: null,
        childIds: [],
        visible: true,
        locked: false,
      },
    },
    rootIds: [...st.rootIds, id],
    selection: [id],
  });
}

function imageSizeFromFile(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || 600;
      const naturalH = img.naturalHeight || 400;
      const scale = 800 / Math.max(naturalW, naturalH);
      resolve({
        w: Math.max(50, Math.round(naturalW * scale)),
        h: Math.max(50, Math.round(naturalH * scale)),
      });
    };
    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    img.src = src;
  });
}

function ImageImportButton() {
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 추가할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const src = String(reader.result);
        const size = await imageSizeFromFile(src);
        addImageAsset({
          name: file.name.replace(/\.[^.]+$/, '') || '이미지',
          src,
          ...size,
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : '이미지를 추가할 수 없습니다.');
      }
    };
    reader.onerror = () => alert('이미지 파일을 읽을 수 없습니다.');
    reader.readAsDataURL(file);
  };

  return (
    <label className="palette-import">
      <input type="file" accept="image/*" onChange={onChange} />
      <span className="swatch image">IMG</span>
      <span className="palette-label">이미지 추가</span>
    </label>
  );
}

/** 좌측 기물 팔레트: 클릭하면 화면 중앙에 추가 */
export function Palette() {
  const unit = useApp((s) => s.unit);
  const favorites = useApp((s) => s.favorites);

  return (
    <div className="palette">
      <div className="panel-title">기물</div>
      <div className="palette-grid">
        <ImageImportButton />
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
