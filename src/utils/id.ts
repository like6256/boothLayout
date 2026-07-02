let counter = 0;

/** Konva findOne('#id') 셀렉터와 호환되도록 영문자로 시작하는 고유 id 생성 */
export function newId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
