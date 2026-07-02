import { useEffect, useRef, useState } from 'react';
import { pauseHistory, resumeHistory, useApp } from '../store/store';
import { absTransform, worldToLocalPoint } from '../utils/geometry';
import { getItemHeight } from '../utils/dimensions';
import { fromMm, toMm } from '../utils/units';
import type { AlignKind, Item, Unit } from '../types';
import { CATALOG_MAP } from '../presets';

/** 숫자 필드: blur/Enter에서만 커밋 (히스토리 1스텝, 타이핑 중 재렌더 없음) */
function NumField({
  label,
  mm,
  unit,
  onCommit,
  raw = false,
}: {
  label: string;
  mm: number;
  unit: Unit;
  onCommit: (mm: number) => void;
  /** true면 단위 변환 없이 그대로 (회전각 등) */
  raw?: boolean;
}) {
  const display = raw ? Math.round(mm * 100) / 100 : fromMm(mm, unit);
  const [txt, setTxt] = useState(String(display));
  useEffect(() => setTxt(String(display)), [display]);
  const commit = () => {
    const v = parseFloat(txt);
    if (Number.isFinite(v)) onCommit(raw ? v : toMm(v, unit));
    else setTxt(String(display));
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      {!raw && <span className="field-unit">{unit}</span>}
      {raw && <span className="field-unit">°</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onCommit,
  textarea = false,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  textarea?: boolean;
}) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  const commit = () => {
    if (txt !== value) onCommit(txt);
  };
  return (
    <label className={`field ${textarea ? 'field-col' : ''}`}>
      <span className="field-label">{label}</span>
      {textarea ? (
        <textarea
          value={txt}
          rows={3}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.stopPropagation()}
        />
      ) : (
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
      )}
    </label>
  );
}

/** 색상 필드: 드래그 중 라이브 반영하되 히스토리는 1스텝만 기록 */
function ColorField({ item }: { item: Item }) {
  const original = useRef<string | null>(null);
  return (
    <label className="field">
      <span className="field-label">색상</span>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#cccccc'}
        onFocus={() => {
          original.current = item.color;
          pauseHistory();
        }}
        onChange={(e) =>
          useApp.getState().updateItems({ [item.id]: { color: e.target.value } })
        }
        onBlur={(e) => {
          const final = e.target.value;
          const st = useApp.getState();
          if (original.current !== null) {
            st.updateItems({ [item.id]: { color: original.current } });
          }
          resumeHistory();
          st.updateItems({ [item.id]: { color: final } });
          original.current = null;
        }}
      />
    </label>
  );
}

const ALIGN_BUTTONS: { kind: AlignKind; label: string; title: string }[] = [
  { kind: 'left', label: '⇤', title: '왼쪽 정렬' },
  { kind: 'hcenter', label: '⇹', title: '가로 가운데 정렬' },
  { kind: 'right', label: '⇥', title: '오른쪽 정렬' },
  { kind: 'top', label: '⤒', title: '위쪽 정렬' },
  { kind: 'vcenter', label: '⇳', title: '세로 가운데 정렬' },
  { kind: 'bottom', label: '⤓', title: '아래쪽 정렬' },
];

function SingleInspector({ id }: { id: string }) {
  const item = useApp((s) => s.items[id]);
  const items = useApp((s) => s.items);
  const unit = useApp((s) => s.unit);
  if (!item) return null;
  const st = () => useApp.getState();
  const abs = absTransform(items, id);
  const typeLabel = item.type === 'group' ? '그룹' : CATALOG_MAP[item.type]?.label ?? '기물';

  const setAbsCenter = (x: number, y: number) => {
    const local = worldToLocalPoint(items, item.parentId, { x, y });
    st().updateItems({ [id]: { x: local.x, y: local.y } });
  };

  return (
    <div className="inspector-body">
      <div className="insp-type">
        {typeLabel}
        {item.parentId && items[item.parentId] && (
          <span className="insp-parent"> · {items[item.parentId].name} 위</span>
        )}
      </div>
      <TextField
        label="이름"
        value={item.name}
        onCommit={(v) => st().updateItems({ [id]: { name: v } })}
      />
      <div className="field-pair">
        <NumField label="X" mm={abs.cx} unit={unit} onCommit={(v) => setAbsCenter(v, abs.cy)} />
        <NumField label="Y" mm={abs.cy} unit={unit} onCommit={(v) => setAbsCenter(abs.cx, v)} />
      </div>
      <div className="field-pair">
        <NumField
          label="가로"
          mm={item.w}
          unit={unit}
          onCommit={(v) => st().updateItems({ [id]: { w: v } })}
        />
        <NumField
          label="세로"
          mm={item.h}
          unit={unit}
          onCommit={(v) => st().updateItems({ [id]: { h: v } })}
        />
      </div>
      <div className="field-pair">
        <NumField
          label="회전"
          mm={item.rotation}
          unit={unit}
          raw
          onCommit={(v) => st().updateItems({ [id]: { rotation: v } })}
        />
        <NumField
          label="높이"
          mm={getItemHeight(item)}
          unit={unit}
          onCommit={(v) => st().updateItems({ [id]: { height: v } })}
        />
      </div>
      <div className="field-pair">
        {item.type !== 'group' && <ColorField item={item} />}
      </div>
      <TextField
        label="메모"
        value={item.memo}
        textarea
        onCommit={(v) => st().updateItems({ [id]: { memo: v } })}
      />
      <div className="btn-grid">
        <button onClick={() => st().duplicateSelection()} title="Ctrl+D">복제</button>
        <button className="danger" onClick={() => st().deleteItems([id])} disabled={item.locked}>
          삭제
        </button>
        <button onClick={() => st().reorderItem(id, 'front')}>맨 앞으로</button>
        <button onClick={() => st().reorderItem(id, 'back')}>맨 뒤로</button>
        <button onClick={() => st().reorderItem(id, 'up')}>앞으로</button>
        <button onClick={() => st().reorderItem(id, 'down')}>뒤로</button>
        <button className={item.locked ? 'active' : ''} onClick={() => st().toggleLock(id)}>
          {item.locked ? '🔒 잠금 해제' : '잠금'}
        </button>
        <button className={!item.visible ? 'active' : ''} onClick={() => st().toggleVisible(id)}>
          {item.visible ? '숨기기' : '보이기'}
        </button>
        {item.type === 'group' ? (
          <button onClick={() => st().ungroupSelection()} title="Ctrl+Shift+G">그룹 해제</button>
        ) : (
          <button onClick={() => st().addFavoriteFromSelection()} title="팔레트 즐겨찾기에 저장">
            ★ 즐겨찾기
          </button>
        )}
      </div>
    </div>
  );
}

function MultiInspector({ ids }: { ids: string[] }) {
  const st = () => useApp.getState();
  return (
    <div className="inspector-body">
      <div className="insp-type">{ids.length}개 선택됨</div>
      <div className="panel-subtitle">정렬</div>
      <div className="align-grid">
        {ALIGN_BUTTONS.map((b) => (
          <button key={b.kind} title={b.title} onClick={() => st().alignSelection(b.kind)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="panel-subtitle">균등 배치 (3개 이상)</div>
      <div className="align-grid two">
        <button title="가로 균등 배치" onClick={() => st().distributeSelection('h')}>
          ↔ 가로
        </button>
        <button title="세로 균등 배치" onClick={() => st().distributeSelection('v')}>
          ↕ 세로
        </button>
      </div>
      <div className="btn-grid">
        <button onClick={() => st().groupSelection()} title="Ctrl+G">그룹</button>
        <button onClick={() => st().ungroupSelection()} title="Ctrl+Shift+G">그룹 해제</button>
        <button onClick={() => st().duplicateSelection()} title="Ctrl+D">복제</button>
        <button className="danger" onClick={() => st().deleteSelection()}>삭제</button>
      </div>
    </div>
  );
}

function EmptyInspector() {
  const booth = useApp((s) => s.booth);
  const unit = useApp((s) => s.unit);
  const count = useApp((s) => Object.keys(s.items).length);
  const st = () => useApp.getState();
  return (
    <div className="inspector-body">
      <div className="insp-type">부스</div>
      <div className="field-pair">
        <NumField
          label="가로"
          mm={booth.w}
          unit={unit}
          onCommit={(v) => st().setBooth({ w: v, h: booth.h })}
        />
        <NumField
          label="세로"
          mm={booth.h}
          unit={unit}
          onCommit={(v) => st().setBooth({ w: booth.w, h: v })}
        />
      </div>
      <button className="wide-btn" onClick={() => st().setBoothDialog('edit')}>
        부스 크기 프리셋…
      </button>
      <div className="stat-line">총 기물 {count}개</div>
      <div className="panel-subtitle">단축키</div>
      <table className="shortcut-table">
        <tbody>
          <tr><td>휠</td><td>확대/축소</td></tr>
          <tr><td>Space+드래그</td><td>화면 이동</td></tr>
          <tr><td>Ctrl+Z / Ctrl+Shift+Z</td><td>실행 취소 / 다시 실행</td></tr>
          <tr><td>Ctrl+C / V / D</td><td>복사 / 붙여넣기 / 복제</td></tr>
          <tr><td>Ctrl+A</td><td>전체 선택</td></tr>
          <tr><td>Ctrl+G / Ctrl+Shift+G</td><td>그룹 / 그룹 해제</td></tr>
          <tr><td>Delete</td><td>삭제</td></tr>
          <tr><td>방향키 (+Shift)</td><td>미세 이동 (크게 이동)</td></tr>
          <tr><td>[ / ]</td><td>뒤로 / 앞으로</td></tr>
          <tr><td>Ctrl+0</td><td>화면에 맞추기</td></tr>
          <tr><td>Ctrl+S / Ctrl+O</td><td>저장 / 열기</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function Inspector() {
  const selection = useApp((s) => s.selection);
  return (
    <div className="inspector">
      <div className="panel-title">속성</div>
      {selection.length === 0 ? (
        <EmptyInspector />
      ) : selection.length === 1 ? (
        <SingleInspector id={selection[0]} />
      ) : (
        <MultiInspector ids={selection} />
      )}
    </div>
  );
}
