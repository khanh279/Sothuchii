/** '#RRGGBB' + độ mờ 0–1 -> 'rgba(r,g,b,a)'. Mã không hợp lệ được trả về nguyên vẹn. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!match) return hex;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${parseInt(match[1], 16)},${parseInt(match[2], 16)},${parseInt(match[3], 16)},${a})`;
}
