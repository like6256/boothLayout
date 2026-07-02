import { useEffect } from 'react';
import { buildDoc, useApp } from './store/store';
import { saveAutosaveDoc, savePrefs } from './utils/persist';
import { useShortcuts } from './hooks/useShortcuts';
import { Toolbar } from './components/Toolbar';
import { Palette } from './components/Palette';
import { CanvasStage } from './components/CanvasStage';
import { Inspector } from './components/Inspector';
import { LayersPanel } from './components/LayersPanel';
import { StatusBar } from './components/StatusBar';
import { BoothDialog } from './components/BoothDialog';

export default function App() {
  useShortcuts();
  const dark = useApp((s) => s.dark);

  useEffect(() => {
    document.body.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  // 문서 변경 시 자동 저장 (디바운스)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let prev = useApp.getState();
    const unsub = useApp.subscribe((s) => {
      const docChanged =
        s.items !== prev.items ||
        s.rootIds !== prev.rootIds ||
        s.booth !== prev.booth ||
        s.projectName !== prev.projectName ||
        s.unit !== prev.unit;
      const prefsChanged =
        s.gridOn !== prev.gridOn ||
        s.snapOn !== prev.snapOn ||
        s.gridSize !== prev.gridSize ||
        s.autoNest !== prev.autoNest ||
        s.smartGuidesOn !== prev.smartGuidesOn ||
        s.dark !== prev.dark ||
        s.viewMode !== prev.viewMode;
      prev = s;
      if (docChanged) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => saveAutosaveDoc(buildDoc(useApp.getState())), 700);
      }
      if (prefsChanged) {
        savePrefs({
          gridOn: s.gridOn,
          snapOn: s.snapOn,
          gridSize: s.gridSize,
          autoNest: s.autoNest,
          smartGuidesOn: s.smartGuidesOn,
          dark: s.dark,
          viewMode: s.viewMode,
        });
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <Palette />
        <div className="center">
          <CanvasStage />
          <StatusBar />
        </div>
        <div className="right">
          <Inspector />
          <LayersPanel />
        </div>
      </div>
      <BoothDialog />
    </div>
  );
}
