import type { FavPreset, ProjectDoc, RecentEntry } from '../types';

const AUTOSAVE_KEY = 'boothplanner:autosave';
const PREFS_KEY = 'boothplanner:prefs';
const FAV_KEY = 'boothplanner:favorites';
const RECENT_KEY = 'boothplanner:recents';

export interface Prefs {
  gridOn?: boolean;
  snapOn?: boolean;
  gridSize?: number;
  autoNest?: boolean;
  smartGuidesOn?: boolean;
  dark?: boolean;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간 부족 등은 무시 (치명적이지 않음)
  }
}

/** 최소한의 문서 형태 검증 */
export function isValidDoc(doc: unknown): doc is ProjectDoc {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as ProjectDoc;
  return (
    typeof d.items === 'object' &&
    d.items !== null &&
    Array.isArray(d.rootIds) &&
    typeof d.booth === 'object' &&
    d.booth !== null &&
    typeof d.booth.w === 'number' &&
    typeof d.booth.h === 'number'
  );
}

export function loadAutosaveDoc(): ProjectDoc | null {
  const doc = readJson<ProjectDoc>(AUTOSAVE_KEY);
  return doc && isValidDoc(doc) ? doc : null;
}

export function saveAutosaveDoc(doc: ProjectDoc): void {
  writeJson(AUTOSAVE_KEY, doc);
}

export function loadPrefs(): Prefs {
  return readJson<Prefs>(PREFS_KEY) ?? {};
}

export function savePrefs(prefs: Prefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function loadFavorites(): FavPreset[] {
  return readJson<FavPreset[]>(FAV_KEY) ?? [];
}

export function saveFavorites(favs: FavPreset[]): void {
  writeJson(FAV_KEY, favs);
}

export function loadRecents(): RecentEntry[] {
  return readJson<RecentEntry[]>(RECENT_KEY) ?? [];
}

export function saveRecents(recents: RecentEntry[]): void {
  writeJson(RECENT_KEY, recents);
}

/** 프로젝트를 .json 파일로 다운로드 */
export function downloadProjectFile(doc: ProjectDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, `${sanitizeFilename(doc.name || 'booth-layout')}.booth.json`);
}

/** 파일 선택 대화상자를 열어 프로젝트 문서를 읽는다 */
export function openProjectFile(onLoad: (doc: ProjectDoc) => void, onError: (msg: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result));
        if (!isValidDoc(doc)) {
          onError('프로젝트 파일 형식이 아닙니다.');
          return;
        }
        onLoad(doc);
      } catch {
        onError('파일을 읽을 수 없습니다. (JSON 파싱 실패)');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'booth-layout';
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
