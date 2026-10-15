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
