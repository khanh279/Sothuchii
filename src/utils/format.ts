import type { Vnd } from '@/types/money';

/** Chèn dấu chấm hàng nghìn cho số nguyên không âm (tự viết, không phụ thuộc Intl của thiết bị). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234567 -> "1.234.567 ₫". Số âm giữ dấu trừ. */
export function formatVnd(vnd: Vnd): string {
  const n = Math.round(+vnd || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(n)))} ₫`;
}

/**
 * Dạng rút gọn như thẻ tổng quan của PWA: 1500 -> "1,5k", 2500000 -> "2,5tr", 3e9 -> "3 tỷ".
 * Một chữ số thập phân khi phần nguyên < 10, ngược lại làm tròn.
 */
export function formatVndCompact(vnd: Vnd): string {
  const n = +vnd || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const short = (v: number, suffix: string) => {
    const digits = v < 10 ? 1 : 0;
    const text = (Math.round(v * 10 ** digits) / 10 ** digits).toString().replace('.', ',');
    return `${sign}${text}${suffix}`;
  };
  if (abs >= 1e9) return short(abs / 1e9, ' tỷ');
  if (abs >= 1e6) return short(abs / 1e6, 'tr');
  if (abs >= 1e3) return short(abs / 1e3, 'k');
  return `${sign}${Math.round(abs)}`;
}
