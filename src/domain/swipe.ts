/**
 * Quy tắc vuốt dòng để hiện nút Sửa / Xoá (chuyển từ `SoTienRow` của PWA):
 * - Vuốt chỉ tính là ngang khi dịch chuyển ≥ 8px và |dx| > 1,3 × |dy|; nếu dòng đang đóng thì phải vuốt sang TRÁI.
 *   Riêng dòng Sửa / Xoá trong danh sách cuộn (`ROW_SWIPE`) dùng ngưỡng dễ hơn (≥ 5px, |dx| > |dy|) để cử chỉ hơi chéo vẫn vào dòng chứ không bị
 *   danh sách cuộn dọc giành mất.
 * - Dòng trượt tối đa 148px (rộng hai nút) cộng thêm 30px kéo quá đà.
 * - Thả tay quá nửa (74px) thì mở hẳn, chưa tới thì đóng lại.
 */

export const SWIPE_ACTIONS_WIDTH = 148;
export const SWIPE_OVERSHOOT = 30;
export const SWIPE_DEAD_ZONE = 8;
export const SWIPE_AXIS_RATIO = 1.3;

export type SwipeIntent = 'pending' | 'horizontal' | 'vertical';

/** Ngưỡng nhận diện vuốt ngang: vùng chết (px) và tỉ lệ |dx| / |dy|. */
export interface SwipeThreshold {
  deadZone: number;
  axisRatio: number;
}

export const DEFAULT_SWIPE: SwipeThreshold = { deadZone: SWIPE_DEAD_ZONE, axisRatio: SWIPE_AXIS_RATIO };

/** Dòng Sửa / Xoá nằm trong danh sách cuộn dọc: nhận ngang sớm hơn (5px) và khi |dx| > |dy| để cuộn dọc không giành mất cử chỉ hơi chéo. */
export const ROW_SWIPE: SwipeThreshold = { deadZone: 5, axisRatio: 1 };

/** Cử chỉ đang là gì, dựa trên độ dịch từ lúc chạm (dx, dy) và trạng thái dòng. */
export function swipeIntent(dx: number, dy: number, isOpen: boolean, threshold: SwipeThreshold = DEFAULT_SWIPE): SwipeIntent {
  if (Math.abs(dx) < threshold.deadZone && Math.abs(dy) < threshold.deadZone) return 'pending';
  return Math.abs(dx) > Math.abs(dy) * threshold.axisRatio && (dx < 0 || isOpen) ? 'horizontal' : 'vertical';
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

/** Vận tốc vuốt (px/ms) đủ để chốt theo hướng vuốt dù chưa kéo quá nửa (ô trượt hai lớp của Chia bill). */
export const SLIDE_FLICK_VELOCITY = 0.35;

/**
 * Tiến độ 0..1 của ô trượt hai lớp khi kéo: 0 = lớp đầu, 1 = lớp thứ hai. Kéo sang trái (dx < 0) tăng tiến độ,
 * kéo sang phải giảm; `startProgress` là tiến độ lúc bắt đầu chạm, `width` là bề rộng khung (px).
 */
export function slideProgress(startProgress: number, dx: number, width: number): number {
  return Math.max(0, Math.min(1, startProgress - dx / (width || 1)));
}

/** Khi thả tay: chốt lớp nào. Vuốt nhanh thì theo hướng vuốt; không thì theo phía gần hơn (quá nửa là lớp thứ hai). */
export function slideSettle(progress: number, vx: number): 0 | 1 {
  if (vx < -SLIDE_FLICK_VELOCITY) return 1;
  if (vx > SLIDE_FLICK_VELOCITY) return 0;
  return progress > 0.5 ? 1 : 0;
}
