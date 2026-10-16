import { averagePerDay, periodDayCount } from './overviewStats';

describe('số liệu phụ thẻ tổng chi', () => {
  it('số ngày của kỳ', () => {
    expect(periodDayCount({ mode: 'month', month: '2026-10' })).toBe(31);
    expect(periodDayCount({ mode: 'month', month: '2026-02' })).toBe(28);
    expect(periodDayCount({ mode: 'year', year: 2028 })).toBe(366);
    expect(periodDayCount({ mode: 'custom', from: '2026-10-01', to: '2026-10-10' })).toBe(10);
    expect(periodDayCount({ mode: 'all' })).toBeNull();
  });

  it('trung bình mỗi ngày = tổng / số ngày của kỳ, làm tròn đồng; kỳ "Tất cả" thì null', () => {
    expect(averagePerDay(8_650_000, { mode: 'month', month: '2026-10' })).toBe(279_032);
    expect(averagePerDay(0, { mode: 'month', month: '2026-10' })).toBe(0);
    expect(averagePerDay(1_000, { mode: 'all' })).toBeNull();
  });
});
