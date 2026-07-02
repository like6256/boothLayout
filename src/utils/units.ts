import type { Unit } from '../types';

/** mm 값을 표시 단위 문자열로 (숫자만) */
export function fmtLen(mm: number, unit: Unit): string {
  switch (unit) {
    case 'mm':
      return String(Math.round(mm));
    case 'cm':
      return String(Math.round(mm / 10 * 10) / 10 / 1); // 소수 1자리
    case 'm':
      return String(Math.round(mm / 1000 * 100) / 100);
  }
}

/** mm 값을 "300 cm" 형태로 */
export function fmtLenWithUnit(mm: number, unit: Unit): string {
  return `${fmtLen(mm, unit)} ${unit}`;
}

/** 표시 단위 숫자 → mm */
export function toMm(value: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'cm':
      return value * 10;
    case 'm':
      return value * 1000;
  }
}

/** mm → 표시 단위 숫자 */
export function fromMm(mm: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return Math.round(mm * 10) / 10;
    case 'cm':
      return Math.round(mm / 10 * 100) / 100;
    case 'm':
      return Math.round(mm / 1000 * 1000) / 1000;
  }
}
