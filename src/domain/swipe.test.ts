import { ROW_SWIPE, swipeIntent, swipeOffset, swipeSettle, swipeToggle, slideProgress, slideSettle } from './swipe';

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

describe('ô trượt hai lớp (slideProgress / slideSettle)', () => {
  it('kéo trái tăng tiến độ, kéo phải giảm, luôn kẹp trong 0..1', () => {
    expect(slideProgress(0, -100, 200)).toBe(0.5);
    expect(slideProgress(0, -400, 200)).toBe(1);
    expect(slideProgress(1, 100, 200)).toBe(0.5);
    expect(slideProgress(1, 300, 200)).toBe(0);
    expect(slideProgress(0, 80, 200)).toBe(0);
  });

  it('chưa đo được bề rộng thì không chia cho 0', () => {
    expect(Number.isFinite(slideProgress(0, -10, 0))).toBe(true);
  });

  it('thả tay: quá nửa thì sang lớp thứ hai, chưa tới nửa thì quay lại', () => {
    expect(slideSettle(0.6, 0)).toBe(1);
    expect(slideSettle(0.4, 0)).toBe(0);
  });

  it('vuốt nhanh thì theo hướng vuốt dù chưa kéo quá nửa', () => {
    expect(slideSettle(0.2, -0.6)).toBe(1);
    expect(slideSettle(0.8, 0.6)).toBe(0);
  });
});

describe('swipeIntent với ngưỡng dòng Sửa / Xoá (ROW_SWIPE)', () => {
  it('vùng chết nhỏ hơn: 5px đã nhận diện, dưới 5px còn chờ', () => {
    expect(swipeIntent(-4, 4, false, ROW_SWIPE)).toBe('pending');
    expect(swipeIntent(-6, 0, false, ROW_SWIPE)).toBe('horizontal');
  });

  it('vuốt hơi chéo (|dx| > |dy|) vẫn là ngang, trong khi ngưỡng mặc định coi là dọc', () => {
    expect(swipeIntent(-20, 16, false, ROW_SWIPE)).toBe('horizontal');
    expect(swipeIntent(-20, 16, false)).toBe('vertical');
  });

  it('cuộn dọc vẫn là dọc: |dy| ≥ |dx| hoặc vuốt sang phải khi dòng đóng', () => {
    expect(swipeIntent(-10, 30, false, ROW_SWIPE)).toBe('vertical');
    expect(swipeIntent(-20, 20, false, ROW_SWIPE)).toBe('vertical');
    expect(swipeIntent(30, 0, false, ROW_SWIPE)).toBe('vertical');
    expect(swipeIntent(30, 0, true, ROW_SWIPE)).toBe('horizontal');
  });
});
