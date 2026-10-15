import { swipeIntent, swipeOffset, swipeSettle, swipeToggle } from './swipe';

describe('swipeIntent', () => {
  it('chưa đủ 8px thì còn chờ', () => {
    expect(swipeIntent(0, 0, false)).toBe('pending');
    expect(swipeIntent(-7, 7, false)).toBe('pending');
    expect(swipeIntent(7.9, -7.9, true)).toBe('pending');
  });

  it('vuốt trái đủ ngang thì là ngang', () => {
    expect(swipeIntent(-20, 0, false)).toBe('horizontal');
    expect(swipeIntent(-20, 10, false)).toBe('horizontal'); // 20 > 13
  });

  it('lệch dọc nhiều thì là cuộn dọc', () => {
    expect(swipeIntent(-20, 16, false)).toBe('vertical'); // 20 < 20.8
    expect(swipeIntent(-10, 30, false)).toBe('vertical');
    expect(swipeIntent(0, 12, false)).toBe('vertical');
  });

  it('dòng đóng mà vuốt sang phải thì không tính', () => {
    expect(swipeIntent(30, 0, false)).toBe('vertical');
  });

  it('dòng đang mở thì vuốt sang phải (đóng lại) được tính là ngang', () => {
    expect(swipeIntent(30, 0, true)).toBe('horizontal');
  });

  it('đúng ngưỡng 1,3 lần không tính là ngang', () => {
    expect(swipeIntent(-26, 20, false)).toBe('vertical'); // 26 == 26 (không lớn hơn)
    expect(swipeIntent(-27, 20, false)).toBe('horizontal');
  });
});

describe('swipeOffset', () => {
  it('đóng: kéo trái đi theo ngón tay, không vượt về bên phải', () => {
    expect(swipeOffset(0, -50)).toBe(-50);
    expect(swipeOffset(0, 40)).toBe(0);
  });

  it('chặn ở 148 + 30 kéo quá đà', () => {
    expect(swipeOffset(0, -148)).toBe(-148);
    expect(swipeOffset(0, -500)).toBe(-178);
  });

  it('đang mở (-148): kéo phải thì đóng dần, kéo trái thêm bị chặn', () => {
    expect(swipeOffset(-148, 100)).toBe(-48);
    expect(swipeOffset(-148, 500)).toBe(0);
    expect(swipeOffset(-148, -20)).toBe(-168);
    expect(swipeOffset(-148, -100)).toBe(-178);
  });
});

describe('swipeSettle', () => {
  it('quá nửa 74px thì mở, chưa tới thì đóng', () => {
    expect(swipeSettle(-75)).toBe('open');
    expect(swipeSettle(-148)).toBe('open');
    expect(swipeSettle(-178)).toBe('open');
    expect(swipeSettle(-74)).toBe('closed');
    expect(swipeSettle(-30)).toBe('closed');
    expect(swipeSettle(0)).toBe('closed');
  });
});

describe('swipeToggle (ô trượt không có nút)', () => {
  it('vuốt trái đủ xa thì mở; chưa đủ xa thì không làm gì', () => {
    expect(swipeToggle(-60, 5, false)).toBe('open');
    expect(swipeToggle(-40, 0, false)).toBe('open');
    expect(swipeToggle(-30, 0, false)).toBeNull();
  });

  it('vuốt phải chỉ đóng khi đang mở; đang đóng thì bỏ qua', () => {
    expect(swipeToggle(60, 0, true)).toBe('close');
    expect(swipeToggle(60, 0, false)).toBeNull();
    expect(swipeToggle(30, 0, true)).toBeNull();
  });

  it('cử chỉ chủ yếu là dọc (cuộn danh sách) thì không bật / tắt', () => {
    expect(swipeToggle(-60, 60, false)).toBeNull();
    expect(swipeToggle(-45, 40, false)).toBeNull();
    expect(swipeToggle(5, 5, false)).toBeNull();
  });
});
