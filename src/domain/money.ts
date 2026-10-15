import type { Nghin, Vnd } from '@/types/money';

/**
 * Đổi nghìn đồng sang đồng. Giống PWA cũ: Math.round(x * 1e3).
 * Giá trị không hợp lệ (NaN, undefined...) được coi là 0, như `+t || 0` trong PWA.
 */
export function nghinToVnd(nghin: Nghin): Vnd {
  return Math.round((+nghin || 0) * 1e3);
}

/** Đổi đồng sang nghìn đồng (có thể ra số lẻ, ví dụ 1500 đ = 1.5). */
export function vndToNghin(vnd: Vnd): Nghin {
  return (+vnd || 0) / 1e3;
}

/** Làm tròn đến 3 chữ số thập phân của nghìn đồng, tức đến từng đồng. Giống `r3` trong PWA. */
export function roundNghin(nghin: Nghin): Nghin {
  return Math.round(nghin * 1e3) / 1e3;
}

/** Làm tròn đồng về số nguyên. */
export function roundVnd(vnd: Vnd): Vnd {
  return Math.round(+vnd || 0);
}

// ───────────── Ô nhập theo NGHÌN đồng (Quỹ nhóm; sau này là Chia bill) ─────────────
// Người dùng gõ "7,5" nghĩa là 7,5 nghìn đồng = 7.500 ₫. Dấu phẩy là dấu thập phân, dấu chấm là hàng nghìn.

/** Chèn dấu chấm hàng nghìn cho chuỗi chữ số (hàm `st` của PWA). */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Định dạng chữ đang gõ trong ô nhập nghìn đồng (hàm `Bt` của PWA): chỉ giữ chữ số và dấu phẩy đầu tiên,
 * phần nguyên tối đa 9 chữ số (bỏ số 0 đầu), phần thập phân tối đa 3 chữ số, phần nguyên có dấu chấm hàng nghìn.
 * "7," được giữ nguyên dấu phẩy để người dùng gõ tiếp.
 */
export function maskNghinInput(text: string): string {
  const cleaned = String(text).replace(/[^0-9,]/g, '');
  const comma = cleaned.indexOf(',');
  const integer = (comma < 0 ? cleaned : cleaned.slice(0, comma)).replace(/^0+(?=\d)/, '').slice(0, 9);
  if (comma < 0) return groupDigits(integer);
  const decimals = cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 3);
  return `${groupDigits(integer || '0')},${decimals}`;
}

/** Đổi chữ trong ô nhập nghìn đồng sang ĐỒNG (hàm `Qt` của PWA). Chữ không hợp lệ → 0. */
export function parseNghinInput(text: string): Vnd {
  const value = parseFloat(String(text).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 1e3) : 0;
}

/** Đổi ĐỒNG sang chữ hiển thị trong ô nhập nghìn đồng (hàm `tt` của PWA): 7500 → "7,5"; 0 → "". */
export function formatNghinInput(vnd: Vnd): string {
  const nghin = Math.round(+vnd || 0) / 1e3;
  if (!nghin) return '';
  const [integer, decimal] = String(nghin).split('.');
  return groupDigits(integer) + (decimal ? `,${decimal}` : '');
}
