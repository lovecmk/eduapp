/**
 * CSV 내보내기.
 *
 * 관리자는 결국 목록을 엑셀로 옮겨 보고서를 만든다. 그 길이 없으면
 * 화면을 캡처하거나 손으로 옮겨 적게 되고, 그 과정에서 반드시 틀린다.
 */

/** CSV 한 칸을 안전하게 감싼다. */
export function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);

  // 수식 주입(CSV injection) 방어: '=', '+', '-', '@' 로 시작하는 값은
  // 엑셀이 수식으로 실행한다. 사용자 닉네임이 "=cmd|..." 라면 그 파일을 연
  // 사람의 PC 에서 명령이 돌 수 있다. 앞에 작은따옴표를 붙여 문자열로 고정한다.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;

  // 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다.
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** 행 배열을 CSV 문자열로. */
export function toCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // CRLF — 엑셀이 가장 무난하게 읽는다.
  return lines.join('\r\n');
}

/** CSV 를 파일로 내려받는다. */
export function downloadCSV(filename: string, headers: string[], rows: unknown[][]): void {
  // BOM 을 붙이지 않으면 엑셀이 UTF-8 을 못 알아채 한글이 전부 깨진다.
  const blob = new Blob(['﻿' + toCSV(headers, rows)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 객체 URL 을 해제하지 않으면 탭이 살아 있는 동안 메모리에 남는다.
  URL.revokeObjectURL(url);
}

/** 파일명에 붙일 날짜 도장(2026-07-27). */
export function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
