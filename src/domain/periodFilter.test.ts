import { isInPeriod } from './expenses';
import { periodHeading, periodRange, periodRangeLabel, periodCompactHeading } from './periodFilter';

describe('nhãn bộ lọc thời gian', () => {
  it('ô chọn gọn: kỳ Tháng ghi gọn T10/2026, các kỳ khác như periodHeading', () => {
    expect(periodCompactHeading({ mode: 'month', month: '2026-10' })).toBe('T10/2026');
    expect(periodCompactHeading({ mode: 'month', month: '2026-02' })).toBe('T2/2026');
    expect(periodCompactHeading({ mode: 'year', year: 2026 })).toBe(periodHeading({ mode: 'year', year: 2026 }));
    expect(periodCompactHeading({ mode: 'all' })).toBe('Tất cả');
  });

  it('tháng: đủ ngày đầu/cuối, đúng tháng 28/29/30/31 ngày', () => {
    expect(periodRange({ mode: 'month', month: '2026-10' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange({ mode: 'month', month: '2026-04' })).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(periodRange({ mode: 'month', month: '2026-02' })?.to).toBe('2026-02-28');
    expect(periodRange({ mode: 'month', month: '2028-02' })?.to).toBe('2028-02-29'); // năm nhuận
  });

  it('tên kỳ và khoảng ngày hiển thị', () => {
    expect(periodHeading({ mode: 'month', month: '2026-10' })).toBe('Tháng 10, 2026');
    expect(periodRangeLabel({ mode: 'month', month: '2026-10' })).toBe('01/10 – 31/10/2026');
    expect(periodRangeLabel({ mode: 'month', month: '2028-02' })).toBe('01/02 – 29/02/2028');
    expect(periodHeading({ mode: 'year', year: 2026 })).toBe('Năm 2026');
    expect(periodRangeLabel({ mode: 'year', year: 2026 })).toBe('01/01 – 31/12/2026');
  });

  it('tuỳ chọn: cùng năm rút gọn, khác năm đủ hai đầu', () => {
    expect(periodHeading({ mode: 'custom', from: '2026-09-17', to: '2026-10-16' })).toBe('Tuỳ chọn');
    expect(periodRangeLabel({ mode: 'custom', from: '2026-09-17', to: '2026-10-16' })).toBe('17/09 – 16/10/2026');
    expect(periodRangeLabel({ mode: 'custom', from: '2025-12-20', to: '2026-01-05' })).toBe('20/12/2025 – 05/01/2026');
  });

  it('"Tất cả" không có khoảng ngày giả', () => {
    expect(periodRange({ mode: 'all' })).toBeNull();
    expect(periodHeading({ mode: 'all' })).toBe('Tất cả');
    expect(periodRangeLabel({ mode: 'all' })).toBe('Toàn bộ thời gian');
  });

  it('khoảng ngày hiển thị khớp đúng với cách lọc dữ liệu (biên gồm cả hai đầu)', () => {
    for (const period of [{ mode: 'month', month: '2028-02' }, { mode: 'year', year: 2026 }, { mode: 'custom', from: '2026-09-17', to: '2026-10-16' }] as const) {
      const range = periodRange(period)!;
      expect(isInPeriod(range.from, period)).toBe(true);
      expect(isInPeriod(range.to, period)).toBe(true);
    }
    expect(isInPeriod('2028-03-01', { mode: 'month', month: '2028-02' })).toBe(false);
    expect(isInPeriod('2028-01-31', { mode: 'month', month: '2028-02' })).toBe(false);
  });
});
