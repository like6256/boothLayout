import { useEffect, useState, type ReactNode } from 'react';
import { useStore as useZustandStore } from 'zustand';
import { buildDoc, clearHistory, redo, undo, useApp } from '../store/store';
import { downloadProjectFile, openProjectFile } from '../utils/persist';
import { exportPdf, exportPng, exportSvg } from '../utils/export';
import { fmtLenWithUnit } from '../utils/units';
import type { Unit } from '../types';

const GRID_SIZES = [10, 25, 50, 100, 250, 500];

function Menu({
  label,
  children,
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap">
      <button className="tb-btn" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu-pop">{children(() => setOpen(false))}</div>
        </>
      )}
    </div>
  );
}

/** 프로젝트 이름: blur/Enter 시에만 커밋해서 히스토리 오염 방지 */
function ProjectNameField() {
  const name = useApp((s) => s.projectName);
  const [txt, setTxt] = useState(name);
  useEffect(() => setTxt(name), [name]);
  const commit = () => {
    const v = txt.trim();
    if (v && v !== name) useApp.getState().setProjectName(v);
    else setTxt(name);
  };
  return (
    <input
      className="project-name"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
      title="프로젝트 이름"
    />
  );
}

export function Toolbar() {
  const unit = useApp((s) => s.unit);
  const dark = useApp((s) => s.dark);
  const tool = useApp((s) => s.tool);
  const gridOn = useApp((s) => s.gridOn);
  const snapOn = useApp((s) => s.snapOn);
  const gridSize = useApp((s) => s.gridSize);
  const autoNest = useApp((s) => s.autoNest);
  const smartGuidesOn = useApp((s) => s.smartGuidesOn);
  const viewMode = useApp((s) => s.viewMode);
  const scale = useApp((s) => s.camera.scale);
  const recents = useApp((s) => s.recents);
  const canUndo = useZustandStore(useApp.temporal, (t) => t.pastStates.length > 0);
  const canRedo = useZustandStore(useApp.temporal, (t) => t.futureStates.length > 0);

  const st = () => useApp.getState();

  const onSave = () => {
    downloadProjectFile(buildDoc(st()));
    st().pushRecent();
  };
  const onOpen = () => {
    openProjectFile(
      (doc) => {
        st().pushRecent();
        st().loadProject(doc);
        clearHistory();
      },
      (msg) => alert(msg),
    );
  };
  const onExport = async (kind: 'png' | 'svg' | 'pdf') => {
    const doc = buildDoc(st());
    try {
      if (kind === 'png') await exportPng(doc);
      else if (kind === 'svg') exportSvg(doc);
      else await exportPdf(doc);
    } catch (err) {
      alert(`내보내기 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="toolbar">
      <div className="tb-row">
        <span className="brand">부스 플래너</span>
        <ProjectNameField />
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => st().setBoothDialog('new')} title="새 프로젝트">
          새로 만들기
        </button>
        <button className="tb-btn" onClick={onOpen} title="프로젝트 열기 (Ctrl+O)">
          열기
        </button>
        <button className="tb-btn" onClick={onSave} title="프로젝트 저장 (Ctrl+S)">
          저장
        </button>
        <Menu label="최근 ▾">
          {(close) => (
            <div className="menu-list">
              {recents.length === 0 && <div className="menu-empty">최근 프로젝트 없음</div>}
              {recents.map((r) => (
                <button
                  key={r.id}
                  className="menu-item"
                  onClick={() => {
                    st().loadRecent(r.id);
                    close();
                  }}
                >
                  <span>{r.name}</span>
                  <span className="menu-sub">{new Date(r.ts).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </Menu>
        <span className="tb-sep" />
        <button className="tb-btn" disabled={!canUndo} onClick={undo} title="실행 취소 (Ctrl+Z)">
          ↩
        </button>
        <button className="tb-btn" disabled={!canRedo} onClick={redo} title="다시 실행 (Ctrl+Shift+Z)">
          ↪
        </button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => st().setBoothDialog('edit')} title="부스 크기 변경">
          부스 크기
        </button>
        <select
          className="tb-select"
          value={unit}
          onChange={(e) => st().setUnit(e.target.value as Unit)}
          title="표시 단위"
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
        <span className="tb-spring" />
        <Menu label="내보내기 ▾">
          {(close) => (
            <div className="menu-list">
              <button className="menu-item" onClick={() => { onExport('png'); close(); }}>
                PNG 이미지
              </button>
              <button className="menu-item" onClick={() => { onExport('svg'); close(); }}>
                SVG 벡터
              </button>
              <button className="menu-item" onClick={() => { onExport('pdf'); close(); }}>
                PDF 문서
              </button>
            </div>
          )}
        </Menu>
        <button className="tb-btn" onClick={() => st().toggleDark()} title="다크 모드">
          {dark ? '☀' : '☾'}
        </button>
        <button
          className="tb-btn active"
          onClick={() => st().toggleViewMode()}
          title="2D / 3D 보기 전환"
        >
          {viewMode === '3d' ? '3D' : '2D'}
        </button>
      </div>
      <div className="tb-row">
        <button
          className={`tb-btn ${tool === 'select' ? 'active' : ''}`}
          onClick={() => st().setTool('select')}
          title="선택 도구 (V)"
        >
          ▲ 선택
        </button>
        <button
          className={`tb-btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => st().setTool('pan')}
          title="화면 이동 도구 (H) — Space로 임시 전환"
        >
          ✋ 이동
        </button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => st().zoomAt({ x: st().containerSize.w / 2, y: st().containerSize.h / 2 }, 1 / 1.25)} title="축소">
          −
        </button>
        <span className="zoom-label" title="확대율 (1px = 1mm 기준 100%)">
          {Math.round(scale * 100)}%
        </span>
        <button className="tb-btn" onClick={() => st().zoomAt({ x: st().containerSize.w / 2, y: st().containerSize.h / 2 }, 1.25)} title="확대">
          +
        </button>
        <button className="tb-btn" onClick={() => st().fitView()} title="화면에 맞추기 (Ctrl+0)">
          맞춤
        </button>
        <span className="tb-sep" />
        <button className={`tb-btn ${gridOn ? 'active' : ''}`} onClick={() => st().toggleGrid()} title="그리드 표시">
          그리드
        </button>
        <button className={`tb-btn ${snapOn ? 'active' : ''}`} onClick={() => st().toggleSnap()} title="그리드 스냅">
          스냅
        </button>
        <select
          className="tb-select"
          value={gridSize}
          onChange={(e) => st().setGridSize(Number(e.target.value))}
          title="그리드 간격"
        >
          {GRID_SIZES.map((g) => (
            <option key={g} value={g}>
              {fmtLenWithUnit(g, unit)}
            </option>
          ))}
        </select>
        <button
          className={`tb-btn ${smartGuidesOn ? 'active' : ''}`}
          onClick={() => st().toggleSmartGuides()}
          title="스마트 가이드 (다른 기물 가장자리에 정렬)"
        >
          가이드
        </button>
        <button
          className={`tb-btn ${autoNest ? 'active' : ''}`}
          onClick={() => st().toggleAutoNest()}
          title="기물을 다른 기물 위에 놓으면 자동으로 얹기 (함께 이동)"
        >
          자동 얹기
        </button>
      </div>
    </div>
  );
}
