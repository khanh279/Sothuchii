import { initialChromeScroll, stepChromeScroll, type ChromeScrollState } from './scrollChrome';

// Mô phỏng một chuỗi cuộn: mỗi bước cách nhau `dt` ms, cuộn thêm `dy` px, trang dài (maxY = 5000).
function scroll(from: ChromeScrollState, startY: number, steps: number, dy: number, dt: number, startT = 1000): ChromeScrollState {
  let state = { ...from, lastY: startY, lastT: startT };
  for (let i = 1; i <= steps; i++) state = stepChromeScroll(state, { y: startY + dy * i, t: startT + dt * i, maxY: 5000 });
  return state;
}

describe('stepChromeScroll', () => {
  it('cuộn xuống nhanh quá 80px thì ẩn', () => {
    const state = scroll(initialChromeScroll, 500, 8, 12, 16); // 96px, 0,75px/ms
    expect(state.hidden).toBe(true);
  });

  it('chưa đủ 80px thì chưa ẩn', () => {
    expect(scroll(initialChromeScroll, 500, 6, 12, 16).hidden).toBe(false); // 72px
  });

  it('cuộn xuống chậm (dưới 0,3px/ms) không ẩn', () => {
    expect(scroll(initialChromeScroll, 500, 30, 4, 40).hidden).toBe(false); // 0,1px/ms
  });

  it('đang ẩn: cuộn lên nhanh quá 80px thì hiện lại', () => {
    const hidden = scroll(initialChromeScroll, 500, 8, 12, 16);
    expect(hidden.hidden).toBe(true);
    const shown = scroll(hidden, hidden.lastY, 8, -12, 16, hidden.lastT + 16);
    expect(shown.hidden).toBe(false);
  });

  it('đang ẩn: cuộn chậm quá 40px (kể cả xuống) thì hiện lại', () => {
    const hidden = scroll(initialChromeScroll, 500, 8, 12, 16);
    const slow = scroll(hidden, hidden.lastY, 20, 3, 60, hidden.lastT + 16);
    expect(slow.hidden).toBe(false);
  });

  it('về gần đầu trang (dưới 60px) thì luôn hiện và xoá đà', () => {
    const hidden = scroll(initialChromeScroll, 500, 8, 12, 16);
    const top = stepChromeScroll(hidden, { y: 30, t: hidden.lastT + 16, maxY: 5000 });
    expect(top).toMatchObject({ hidden: false, run: 0, samples: 0 });
  });

  it('về gần cuối trang (cách đáy dưới 6px) thì luôn hiện', () => {
    const hidden = scroll(initialChromeScroll, 500, 8, 12, 16);
    expect(stepChromeScroll(hidden, { y: 4996, t: hidden.lastT + 16, maxY: 5000 }).hidden).toBe(false);
  });

  it('đổi hướng thì bắt đầu đoạn mới (không cộng dồn với đoạn trước)', () => {
    let state = scroll(initialChromeScroll, 500, 5, 12, 16); // xuống 60px
    state = scroll(state, state.lastY, 1, -12, 16, state.lastT + 16); // đổi hướng
    expect(state.run).toBe(-12);
    expect(state.hidden).toBe(false);
  });

  it('mẫu cách nhau từ 200ms trở lên không tính vào tốc độ', () => {
    const state = stepChromeScroll({ ...initialChromeScroll, lastY: 500, lastT: 1000 }, { y: 520, t: 1300, maxY: 5000 });
    expect(state.samples).toBe(0);
    expect(state.run).toBe(20);
  });

  it('đứng yên (delta 0) thì xoá đà', () => {
    const moving = scroll(initialChromeScroll, 500, 4, 12, 16);
    const still = stepChromeScroll(moving, { y: moving.lastY, t: moving.lastT + 16, maxY: 5000 });
    expect(still.run).toBe(0);
  });

  it('trang ngắn hơn khung (maxY = 0): luôn hiện', () => {
    expect(stepChromeScroll(initialChromeScroll, { y: 100, t: 1000, maxY: 0 }).hidden).toBe(false);
  });

  it('không sửa trạng thái đầu vào', () => {
    const copy = { ...initialChromeScroll };
    stepChromeScroll(initialChromeScroll, { y: 100, t: 50, maxY: 5000 });
    expect(initialChromeScroll).toEqual(copy);
  });
});
