import { useState } from 'react';
import { useApp } from '../store/store';
import type { Item } from '../types';

function LayerRow({
  id,
  depth,
  expanded,
  toggleExpand,
  editingId,
  setEditingId,
}: {
  id: string;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const item = useApp((s) => s.items[id]);
  const selected = useApp((s) => s.selection.includes(id));
  if (!item) return null;
  const st = () => useApp.getState();
  const hasChildren = item.childIds.length > 0;
  const isOpen = expanded.has(id);

  return (
    <>
      <div
        className={`layer-row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey) st().toggleSelect(id);
          else st().setSelection([id]);
        }}
        onDoubleClick={() => setEditingId(id)}
      >
        <span
          className={`layer-expand ${hasChildren ? '' : 'hidden'}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(id);
          }}
        >
          {isOpen ? '▾' : '▸'}
        </span>
        <span
          className={`layer-dot ${item.shape === 'circle' ? 'round' : ''}`}
          style={{ background: item.type === 'group' ? 'transparent' : item.color, borderStyle: item.type === 'group' ? 'dashed' : 'solid' }}
        />
        {editingId === id ? (
          <input
            className="layer-rename"
            autoFocus
            defaultValue={item.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== item.name) st().updateItems({ [id]: { name: v } });
              setEditingId(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
        ) : (
          <span className={`layer-name ${!item.visible ? 'dimmed' : ''}`}>{item.name}</span>
        )}
        <span className="layer-btns">
          <button
            className={`icon-btn ${!item.visible ? 'off' : ''}`}
            title={item.visible ? '숨기기' : '보이기'}
            onClick={(e) => {
              e.stopPropagation();
              st().toggleVisible(id);
            }}
          >
            {item.visible ? '👁' : '─'}
          </button>
          <button
            className={`icon-btn ${item.locked ? 'on' : ''}`}
            title={item.locked ? '잠금 해제' : '잠금'}
            onClick={(e) => {
              e.stopPropagation();
              st().toggleLock(id);
            }}
          >
            {item.locked ? '🔒' : '🔓'}
          </button>
        </span>
      </div>
      {hasChildren &&
        isOpen &&
        [...item.childIds].reverse().map((cid) => (
          <LayerRow
            key={cid}
            id={cid}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        ))}
    </>
  );
}

export function LayersPanel() {
  const rootIds = useApp((s) => s.rootIds);
  const selection = useApp((s) => s.selection);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const st = () => useApp.getState();

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSel = selection.length > 0;

  return (
    <div className="layers">
      <div className="panel-title">
        레이어
        <span className="layer-order-btns">
          <button className="icon-btn" disabled={!hasSel} title="맨 앞으로" onClick={() => st().reorderSelection('front')}>⤒</button>
          <button className="icon-btn" disabled={!hasSel} title="앞으로" onClick={() => st().reorderSelection('up')}>▲</button>
          <button className="icon-btn" disabled={!hasSel} title="뒤로" onClick={() => st().reorderSelection('down')}>▼</button>
          <button className="icon-btn" disabled={!hasSel} title="맨 뒤로" onClick={() => st().reorderSelection('back')}>⤓</button>
        </span>
      </div>
      <div className="layers-list">
        {rootIds.length === 0 && <div className="empty-note">기물이 없습니다</div>}
        {[...rootIds].reverse().map((id) => (
          <LayerRow
            key={id}
            id={id}
            depth={0}
            expanded={expanded}
            toggleExpand={toggleExpand}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        ))}
      </div>
      <div className="layers-hint">더블클릭: 이름 변경 · 위 = 앞</div>
    </div>
  );
}

export type { Item };
