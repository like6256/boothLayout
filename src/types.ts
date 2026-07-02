/** 길이 표시 단위. 내부 좌표계는 항상 mm. */
export type Unit = 'mm' | 'cm' | 'm';

export type ShapeKind = 'rect' | 'circle';

/**
 * 캔버스에 놓이는 모든 기물.
 *
 * 좌표계 규약:
 * - (x, y)는 기물 "중심"의 좌표.
 * - 루트 기물이면 월드(mm) 좌표, 자식 기물이면 부모의 회전 전 좌상단 원점 기준 로컬 좌표.
 * - rotation은 부모 기준 상대 회전(도 단위). 절대 회전 = 조상 회전의 합.
 */
export interface Item {
  id: string;
  /** 카탈로그 키 또는 'group'. 새 기물 종류는 presets.ts 카탈로그에만 추가하면 된다. */
  type: string;
  shape: ShapeKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  color: string;
  memo: string;
  parentId: string | null;
  /** z순서: 배열 앞 = 아래, 뒤 = 위 */
  childIds: string[];
  visible: boolean;
  locked: boolean;
}

export interface BoothSpec {
  w: number;
  h: number;
}

/** 저장/불러오기 되는 프로젝트 문서 전체 */
export interface ProjectDoc {
  version: 1;
  name: string;
  unit: Unit;
  booth: BoothSpec;
  items: Record<string, Item>;
  /** z순서: 배열 앞 = 아래, 뒤 = 위 */
  rootIds: string[];
}

/** 즐겨찾기 프리셋: 선택한 기물(하위 포함)을 통째로 저장 */
export interface FavPreset {
  id: string;
  name: string;
  topId: string;
  items: Record<string, Item>;
}

export interface RecentEntry {
  id: string;
  name: string;
  ts: number;
  json: string;
}

export interface GuideLine {
  points: number[];
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeAxis = 'h' | 'v';
