import { createNavGuard } from './nav-guard';

describe('createNavGuard', () => {
  it('bấm lặp cùng đích trong khoảng chặn thì bị bỏ qua, quá khoảng đó thì đi tiếp', () => {
    let time = 1_000;
    const allow = createNavGuard(800, () => time);
    expect(allow('push:/a')).toBe(true);
    time += 300;
    expect(allow('push:/a')).toBe(false);
    time += 400; // 700ms kể từ lần được chấp nhận
    expect(allow('push:/a')).toBe(false);
    time += 200; // 900ms
    expect(allow('push:/a')).toBe(true);
  });

  it('khác đích hoặc khác loại lệnh thì không bị chặn', () => {
    const allow = createNavGuard(800, () => 5_000);
    expect(allow('push:/a')).toBe(true);
    expect(allow('push:/b')).toBe(true);
    expect(allow('back')).toBe(true);
    expect(allow('back')).toBe(false);
  });
});
