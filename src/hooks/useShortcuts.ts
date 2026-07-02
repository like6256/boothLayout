import { useEffect } from 'react';
import { buildDoc, clearHistory, redo, undo, useApp } from '../store/store';
import { downloadProjectFile, openProjectFile } from '../utils/persist';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/**
 * 전역 키보드 단축키.
 * 한글 IME에서도 동작하도록 문자 키는 e.code(물리 키) 기준으로 처리한다.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Space: 임시 팬
      if (e.code === 'Space') {
        e.preventDefault();
        st.setSpaceDown(true);
        return;
      }

      if (mod) {
        switch (e.code) {
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
          case 'KeyY':
            e.preventDefault();
            redo();
            return;
          case 'KeyA':
            e.preventDefault();
            st.selectAll();
            return;
          case 'KeyC':
            e.preventDefault();
            st.copySelection();
            return;
          case 'KeyV':
            e.preventDefault();
            st.pasteClipboard();
            return;
          case 'KeyD':
            e.preventDefault();
            st.duplicateSelection();
            return;
          case 'KeyG':
            e.preventDefault();
            if (e.shiftKey) st.ungroupSelection();
            else st.groupSelection();
            return;
          case 'KeyS':
            e.preventDefault();
            downloadProjectFile(buildDoc(st));
            st.pushRecent();
            return;
          case 'KeyO':
            e.preventDefault();
            openProjectFile(
              (doc) => {
                useApp.getState().pushRecent();
                useApp.getState().loadProject(doc);
                clearHistory();
              },
              (msg) => alert(msg),
            );
            return;
          case 'Digit0':
          case 'Numpad0':
            e.preventDefault();
            st.fitView();
            return;
          case 'Equal':
          case 'NumpadAdd':
            e.preventDefault();
            st.zoomAt({ x: st.containerSize.w / 2, y: st.containerSize.h / 2 }, 1.25);
            return;
          case 'Minus':
          case 'NumpadSubtract':
            e.preventDefault();
            st.zoomAt({ x: st.containerSize.w / 2, y: st.containerSize.h / 2 }, 1 / 1.25);
            return;
        }
        return;
      }

      switch (e.code) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          st.deleteSelection();
          return;
        case 'Escape':
          st.clearSelection();
          st.setBoothDialog('closed');
          return;
        case 'KeyV':
          st.setTool('select');
          return;
        case 'KeyH':
          st.setTool('pan');
          return;
        case 'BracketLeft':
          st.reorderSelection('down');
          return;
        case 'BracketRight':
          st.reorderSelection('up');
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (st.selection.length === 0) return;
          e.preventDefault();
          const base = st.snapOn ? st.gridSize : 10;
          const step = e.shiftKey ? base * 5 : base;
          const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
          const dy = e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0;
          st.moveSelectedByWorld(dx, dy);
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useApp.getState().setSpaceDown(false);
    };
    const onBlur = () => useApp.getState().setSpaceDown(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
