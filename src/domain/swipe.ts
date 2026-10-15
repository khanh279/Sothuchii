/**
 * Quy tắc vuốt dòng để hiện nút Sửa / Xoá (chuyển từ `SoTienRow` của PWA):
 * - Vuốt chỉ tính là ngang khi dịch chuyển ≥ 8px và |dx| > 1,3 × |dy|; nếu dòng đang đóng thì phải vuốt sang TRÁI.
 * - Dòng trượt tối đa 148px (rộng hai nút) cộng thêm 30px kéo quá đà.
 * - Thả tay quá nửa (74px) thì mở hẳn, chưa tới thì đóng lại.
 */

export const SWIPE_ACTIONS_WIDTH = 148;
export const SWIPE_OVERSHOOT = 30;
export const SWIPE_DEAD_ZONE = 8;
export const SWIPE_AXIS_RATIO = 1.3;

export type SwipeIntent = 'pending' | 'horizontal' | 'vertical';

/** Cử chỉ đang là gì, dựa trên độ dịch từ lúc chạm (dx, dy) và trạng thái dòng. */
export function swipeIntent(dx: number, dy: number, isOpen: boolean): SwipeIntent {
  if (Math.abs(dx) < SWIPE_DEAD_ZONE && Math.abs(dy) < SWIPE_DEAD_ZONE) return 'pending';
  return Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO && (dx < 0 || isOpen) ? 'horizontal' : 'vertical';
}

/** Vị trí ngang của dòng (≤ 0) khi đang kéo; `startOffset` là -148 nếu dòng đang mở, ngược lại 0. */
export function swipeOffset(startOffset: number, dx: number): number {
  return Math.max(-SWIPE_ACTIONS_WIDTH - SWIPE_OVERSHOOT, Math.min(0, startOffset + dx));
}

/** Khi thả tay: mở hẳn hay đóng lại. */
export function swipeSettle(offset: number): 'open' | 'closed' {
  return offset < -SWIPE_ACTIONS_WIDTH / 2 ? 'open' : 'closed';
}

/** Quãng vuốt (px) để bật / tắt một ô trượt (Chia bill: ô hệ số / mức cố định). */
export const SWIPE_TOGGLE_DISTANCE = 40;

/**
 * Vuốt ô trượt không có nút (khác dòng Sửa / Xoá): vuốt trái đủ xa thì mở, vuốt phải đủ xa khi đang mở thì đóng.
 * Cử chỉ chưa rõ là ngang hoặc chưa đủ xa thì không làm gì (`null`).
 */
export function swipeToggle(dx: number, dy: number, isOpen: boolean): 'open' | 'close' | null {
  if (swipeIntent(dx, dy, isOpen) !== 'horizontal') return null;
  if (dx <= -SWIPE_TOGGLE_DISTANCE) return 'open';
  if (dx >= SWIPE_TOGGLE_DISTANCE && isOpen) return 'close';
  return null;
}
