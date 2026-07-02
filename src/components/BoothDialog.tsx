import { useEffect, useState } from 'react';
import { clearHistory, useApp } from '../store/store';
import { BOOTH_PRESETS } from '../presets';
import { fromMm, toMm } from '../utils/units';

/** 부스 크기 설정 / 새 프로젝트 다이얼로그 */
export function BoothDialog() {
  const mode = useApp((s) => s.boothDialog);
  const booth = useApp((s) => s.booth);
  const unit = useApp((s) => s.unit);
  const [wTxt, setWTxt] = useState('');
  const [hTxt, setHTxt] = useState('');

  useEffect(() => {
    if (mode !== 'closed') {
      setWTxt(String(fromMm(booth.w, unit)));
      setHTxt(String(fromMm(booth.h, unit)));
    }
  }, [mode, booth, unit]);

  if (mode === 'closed') return null;
  const st = () => useApp.getState();

  const close = () => st().setBoothDialog('closed');
  const confirm = () => {
    const w = toMm(parseFloat(wTxt), unit);
    const h = toMm(parseFloat(hTxt), unit);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      alert('올바른 크기를 입력하세요.');
      return;
    }
    if (mode === 'new') {
      st().newProject({ w, h });
      clearHistory();
    } else {
      st().setBooth({ w, h });
    }
    close();
  };

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">
          {mode === 'new' ? '새 프로젝트 — 부스 크기' : '부스 크기 변경'}
        </div>
        {mode === 'new' && (
          <div className="dialog-note">현재 작업 내용은 지워집니다. (자동 저장은 최근 목록에 남습니다)</div>
        )}
        <div className="dialog-presets">
          {BOOTH_PRESETS.map((p) => (
            <button
              key={p.label}
              className="preset-chip"
              onClick={() => {
                setWTxt(String(fromMm(p.w, unit)));
                setHTxt(String(fromMm(p.h, unit)));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="dialog-fields">
          <label>
            가로
            <input
              value={wTxt}
              onChange={(e) => setWTxt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm();
                e.stopPropagation();
              }}
              autoFocus
            />
            <span>{unit}</span>
          </label>
          <span className="dialog-x">×</span>
          <label>
            세로
            <input
              value={hTxt}
              onChange={(e) => setHTxt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm();
                e.stopPropagation();
              }}
            />
            <span>{unit}</span>
          </label>
        </div>
        <div className="dialog-actions">
          <button onClick={close}>취소</button>
          <button className="primary" onClick={confirm}>
            {mode === 'new' ? '새로 만들기' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
