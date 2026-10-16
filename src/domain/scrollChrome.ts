/**
 * Khi nào ẩn / hiện thanh tab dưới và nút "+ Chi tiêu" lúc cuộn (hàm thuần; chuyển từ bộ nghe `scroll` của PWA):
 * - Gần đầu trang (y < 60) hoặc gần cuối trang (cách đáy < 6px): luôn hiện, xoá đà cuộn.
 * - Đổi hướng cuộn hoặc đứng yên: bắt đầu đoạn mới (`run` = quãng cuộn cùng hướng).
 * - Tốc độ trung bình (px/ms) chỉ tính các mẫu cách nhau dưới 200ms; mẫu cách quá lâu bị bỏ qua.
 * - Cuộn XUỐNG quá 80px và nhanh (> 0,45 px/ms) → ẩn.
 * - Cuộn LÊN quá 80px và nhanh, hoặc cuộn chậm (< 0,3 px/ms) quá 40px theo hướng nào cũng được → hiện lại.
 */

export const CHROME_TOP_ZONE = 60;
export const CHROME_BOTTOM_ZONE = 6;
export const CHROME_HIDE_DISTANCE = 80;
export const CHROME_FAST_SPEED = 0.45;
export const CHROME_SLOW_DISTANCE = 40;
export const CHROME_SLOW_SPEED = 0.3;
export const CHROME_MAX_SAMPLE_GAP_MS = 200;
export const CHROME_MIN_SAMPLE_MS = 8;

export interface ChromeScrollState {
  lastY: number;
  lastT: number;
  /** Quãng cuộn (có dấu) theo cùng một hướng từ lần đổi hướng gần nhất. */
  run: number;
  speedSum: number;
  samples: number;
  /** true = đang ẩn thanh dưới và nút nổi. */
  hidden: boolean;
}

export interface ChromeScrollSample {
  /** Vị trí cuộn hiện tại (px từ đầu). */
  y: number;
  /** Thời điểm đo (ms). */
  t: number;
  /** Vị trí cuộn lớn nhất (nội dung trừ khung nhìn); 0 nếu nội dung ngắn hơn khung. */
  maxY: number;
}

export const initialChromeScroll: ChromeScrollState = { lastY: 0, lastT: 0, run: 0, speedSum: 0, samples: 0, hidden: false };

/** Trạng thái sau một lần cuộn; không sửa `state`. */
export function stepChromeScroll(state: ChromeScrollState, sample: ChromeScrollSample): ChromeScrollState {
  const delta = sample.y - state.lastY;
  const elapsed = Math.max(CHROME_MIN_SAMPLE_MS, sample.t - state.lastT);
  let { run, speedSum, samples, hidden } = state;

  if (sample.y < CHROME_TOP_ZONE || sample.y > sample.maxY - CHROME_BOTTOM_ZONE) {
    hidden = false;
    run = 0;
    speedSum = 0;
    samples = 0;
  } else {
    if (delta === 0 || delta > 0 !== run > 0) {
      run = 0;
      speedSum = 0;
      samples = 0;
    }
    run += delta;
    if (elapsed < CHROME_MAX_SAMPLE_GAP_MS) {
      speedSum += Math.abs(delta) / elapsed;
      samples++;
    }
    const speed = samples ? speedSum / samples : 0;
    if (run > CHROME_HIDE_DISTANCE && speed > CHROME_FAST_SPEED) hidden = true;
    else if ((run < -CHROME_HIDE_DISTANCE && speed > CHROME_FAST_SPEED) || (Math.abs(run) > CHROME_SLOW_DISTANCE && speed < CHROME_SLOW_SPEED)) hidden = false;
  }
  return { lastY: sample.y, lastT: sample.t, run, speedSum, samples, hidden };
}
