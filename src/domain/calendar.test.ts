import { WEEKDAY_HEADERS, buildCalendarMonth, clampDate, openCalendar } from './calendar';

const TODAY = '2025-10-08';
const days = (m: ReturnType<typeof buildCalendarMonth>) => m.weeks.flat().filter((c) => c !== null);

describe('lưới tháng', () => {
  it('tuần bắt đầu từ thứ Hai: 1/10/2025 là thứ Tư → 2 ô trống đầu', () => {
    const m = buildCalendarMonth('2025-10', { selected: TODAY, today: TODAY });
    expect(WEEKDAY_HEADERS).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(m.weeks[0].slice(0, 3).map((c) => c?.day ?? null)).toEqual([null, null, 1]);
    expect(m.title).toBe('Tháng 10, 2025');
  });

  it('mỗi hàng đủ 7 ô và số ngày đúng cho mọi tháng, kể cả năm nhuận', () => {
    for (const [month, count] of [['2024-02', 29], ['2025-02', 28], ['2025-04', 30], ['2025-12', 31]] as const) {
      const m = buildCalendarMonth(month, { selected: `${month}-01`, today: TODAY });
      expect(m.weeks.every((w) => w.length === 7)).toBe(true);
      expect(days(m)).toHaveLength(count);
      expect(days(m)[count - 1]?.date).toBe(`${month}-${count}`);
    }
  });

  it('Chủ nhật đứng cuối hàng; tháng bắt đầu Chủ nhật có 6 ô trống đầu', () => {
    // 1/2/2026 là Chủ nhật
    const m = buildCalendarMonth('2026-02', { selected: '2026-02-01', today: TODAY });
    expect(m.weeks[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(m.weeks[0][6]?.day).toBe(1);
    // 1/9/2025 là thứ Hai → không có ô trống đầu
    const sep = buildCalendarMonth('2025-09', { selected: '2025-09-01', today: TODAY });
    expect(sep.weeks[0][0]?.day).toBe(1);
  });

  it('đánh dấu ngày đang chọn, hôm nay, và ngày sau max bị khoá', () => {
    const m = buildCalendarMonth('2025-10', { selected: '2025-10-05', today: TODAY, max: TODAY });
    const byDay = new Map(days(m).map((c) => [c!.day, c!]));
    expect(byDay.get(5)).toMatchObject({ selected: true, today: false, disabled: false });
    expect(byDay.get(8)).toMatchObject({ selected: false, today: true, disabled: false });
    expect(byDay.get(9)).toMatchObject({ disabled: true });
    expect(byDay.get(31)).toMatchObject({ disabled: true });
    expect(byDay.get(1)).toMatchObject({ disabled: false });
  });

  it('min khoá các ngày trước đó', () => {
    const m = buildCalendarMonth('2025-10', { selected: TODAY, today: TODAY, min: '2025-10-03' });
    const byDay = new Map(days(m).map((c) => [c!.day, c!]));
    expect(byDay.get(2)?.disabled).toBe(true);
    expect(byDay.get(3)?.disabled).toBe(false);
  });

  it('nút tháng trước/sau khoá ở biên', () => {
    const limits = { selected: TODAY, today: TODAY, min: '2025-08-15', max: TODAY };
    expect(buildCalendarMonth('2025-10', limits)).toMatchObject({ nextDisabled: true, prevDisabled: false });
    expect(buildCalendarMonth('2025-09', limits)).toMatchObject({ nextDisabled: false, prevDisabled: false });
    expect(buildCalendarMonth('2025-08', limits)).toMatchObject({ nextDisabled: false, prevDisabled: true });
    // không giới hạn thì không khoá
    expect(buildCalendarMonth('2025-08', { selected: TODAY, today: TODAY })).toMatchObject({ nextDisabled: false, prevDisabled: false });
  });

  it('qua mốc năm vẫn đúng', () => {
    const m = buildCalendarMonth('2026-01', { selected: '2026-01-01', today: '2026-01-10', max: '2026-01-10' });
    expect(m.prevDisabled).toBe(false);
    expect(m.nextDisabled).toBe(true);
    expect(m.title).toBe('Tháng 1, 2026');
  });
});

describe('mở lịch', () => {
  it('kéo ngày về trong khoảng cho phép', () => {
    expect(clampDate('2025-12-01', { max: TODAY }, TODAY)).toBe(TODAY);
    expect(clampDate('2025-01-01', { min: '2025-03-01', max: TODAY }, TODAY)).toBe('2025-03-01');
    expect(clampDate('2025-10-01', { max: TODAY }, TODAY)).toBe('2025-10-01');
  });

  it('ngày rỗng hoặc sai dùng hôm nay', () => {
    expect(clampDate('', { max: TODAY }, TODAY)).toBe(TODAY);
    expect(clampDate('2025-02-30', { max: TODAY }, TODAY)).toBe(TODAY);
  });

  it('openCalendar trả ngày chọn và tháng hiển thị', () => {
    expect(openCalendar('2025-07-04', TODAY, { max: TODAY })).toEqual({ selected: '2025-07-04', month: '2025-07' });
    expect(openCalendar('2099-01-01', TODAY, { max: TODAY })).toEqual({ selected: TODAY, month: '2025-10' });
    expect(openCalendar('', TODAY, {})).toEqual({ selected: TODAY, month: '2025-10' });
  });
});
