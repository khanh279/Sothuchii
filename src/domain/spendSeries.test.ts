import type { Period } from '@/types/expense';

import { buildSpendSeries, daysInMonth, mondayOf } from './spendSeries';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const e = (d: string, a: number) => ({ d, a });
const OCT: Period = { mode: 'month', month: '2025-10' };
const FEB_LEAP: Period = { mode: 'month', month: '2024-02' };
const YEAR: Period = { mode: 'year', year: 2025 };
const custom = (from: string, to: string): Period => ({ mode: 'custom', from, to });
const ALL: Period = { mode: 'all' };

describe('daysInMonth / mondayOf', () => {
  it('đúng số ngày, kể cả tháng 2 năm nhuận', () => {
    expect(daysInMonth('2025-10')).toBe(31);
    expect(daysInMonth('2025-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
  });
  it('thứ hai của tuần (chủ nhật thuộc tuần trước)', () => {
    expect(mondayOf('2025-10-06')).toBe('2025-10-06'); // thứ hai
    expect(mondayOf('2025-10-08')).toBe('2025-10-06'); // thứ tư
    expect(mondayOf('2025-10-12')).toBe('2025-10-06'); // chủ nhật
    expect(mondayOf('2025-10-13')).toBe('2025-10-13');
    expect(mondayOf('2025-11-02')).toBe('2025-10-27'); // chủ nhật đầu tháng 11, qua tháng
  });
});

describe('kỳ Tháng / Năm', () => {
  it('tháng: một cột cho mỗi ngày của tháng, cộng các khoản cùng ngày', () => {
    const series = buildSpendSeries([e('2025-10-01', 50_000), e('2025-10-01', 20_000), e('2025-10-31', 10_000)], OCT)!;
    expect(series.unit).toBe('day');
    expect(series.buckets).toHaveLength(31);
    expect(series.buckets[0]).toEqual({ index: 1, key: '2025-10-01', start: '2025-10-01', end: '2025-10-01', amount: 70_000 });
    expect(series.buckets[30].amount).toBe(10_000);
    expect(series.total).toBe(80_000);
    expect(series.max).toBe(70_000);
    expect(series.peak?.key).toBe('2025-10-01');
  });

  it('tháng 2 năm nhuận có 29 cột; khoản chi ngoài tháng bị bỏ qua', () => {
    expect(buildSpendSeries([], FEB_LEAP)!.buckets).toHaveLength(29);
    expect(buildSpendSeries([e('2025-09-30', 99_000), e('2025-11-01', 99_000), e('2025-10-15', 5_000)], OCT)!.total).toBe(5_000);
  });

  it('năm: 12 cột theo tháng', () => {
    const series = buildSpendSeries([e('2025-01-05', 10_000), e('2025-01-20', 5_000), e('2025-12-31', 7_000), e('2024-12-31', 99_000)], YEAR)!;
    expect(series.unit).toBe('month');
    expect(series.buckets).toHaveLength(12);
    expect(series.buckets[0]).toEqual({ index: 1, key: '2025-01', start: '2025-01-01', end: '2025-01-31', amount: 15_000 });
    expect(series.buckets[11].amount).toBe(7_000);
    expect(series.total).toBe(22_000);
  });

  it('không có khoản chi: vẫn có cột, tổng 0, không có cột cao nhất', () => {
    expect(buildSpendSeries([], OCT)).toMatchObject({ total: 0, max: 0, peak: null });
  });
});

describe('kỳ Tuỳ chọn', () => {
  it('đến 31 ngày: theo ngày, cả khi khoảng vắt qua hai tháng', () => {
    const series = buildSpendSeries([e('2025-10-30', 1_000), e('2025-11-02', 2_000)], custom('2025-10-28', '2025-11-03'))!;
    expect(series.unit).toBe('day');
    expect(series.buckets.map((b) => b.key)).toEqual(['2025-10-28', '2025-10-29', '2025-10-30', '2025-10-31', '2025-11-01', '2025-11-02', '2025-11-03']);
    expect(series.buckets[2].amount).toBe(1_000);
    expect(series.buckets[5].amount).toBe(2_000);
  });

  it('khoảng ngắn 2 ngày vẫn có biểu đồ 2 cột; 1 ngày thì không', () => {
    expect(buildSpendSeries([e('2025-10-05', 1_000)], custom('2025-10-05', '2025-10-06'))!.buckets).toHaveLength(2);
    expect(buildSpendSeries([e('2025-10-05', 1_000)], custom('2025-10-05', '2025-10-05'))).toBeNull();
  });

  it('32 đến 120 ngày: theo tuần (thứ hai đầu tuần), cộng đúng tuần', () => {
    const series = buildSpendSeries([e('2025-10-06', 10_000), e('2025-10-12', 5_000), e('2025-10-13', 7_000)], custom('2025-10-01', '2025-11-15'))!;
    expect(series.unit).toBe('week');
    expect(series.buckets[0].key).toBe('2025-09-29'); // tuần chứa 01/10 bắt đầu thứ hai 29/09
    const week = series.buckets.find((b) => b.key === '2025-10-06')!;
    expect(week).toMatchObject({ start: '2025-10-06', end: '2025-10-12', amount: 15_000 });
    expect(series.buckets.find((b) => b.key === '2025-10-13')!.amount).toBe(7_000);
    expect(series.buckets[series.buckets.length - 1].start <= '2025-11-15').toBe(true);
    expect(series.total).toBe(22_000);
  });

  it('trên 120 ngày: theo tháng', () => {
    const series = buildSpendSeries([e('2025-01-10', 3_000), e('2025-06-20', 4_000)], custom('2025-01-01', '2025-06-30'))!;
    expect(series.unit).toBe('month');
    expect(series.buckets.map((b) => b.key)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']);
    expect(series.total).toBe(7_000);
  });

  it('khoảng sai thứ tự: không có biểu đồ', () => {
    expect(buildSpendSeries([e('2025-10-05', 1_000)], custom('2025-10-10', '2025-10-01'))).toBeNull();
  });
});

describe('kỳ Tất cả', () => {
  it('chưa có khoản chi: không có biểu đồ', () => {
    expect(buildSpendSeries([], ALL)).toBeNull();
  });

  it('mọi khoản trong một ngày: không có biểu đồ (một cột)', () => {
    expect(buildSpendSeries([e('2025-10-05', 1_000), e('2025-10-05', 2_000)], ALL)).toBeNull();
  });

  it('trong một tháng: theo ngày, từ khoản đầu đến khoản cuối', () => {
    const series = buildSpendSeries([e('2025-10-05', 1_000), e('2025-10-09', 2_000)], ALL)!;
    expect(series.unit).toBe('day');
    expect(series.buckets.map((b) => b.key)).toEqual(['2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09']);
  });

  it('từ 2 đến 24 tháng: theo tháng, tháng không chi vẫn có cột 0, qua năm đúng', () => {
    const series = buildSpendSeries([e('2025-11-20', 1_000), e('2026-02-03', 2_000)], ALL)!;
    expect(series.unit).toBe('month');
    expect(series.buckets.map((b) => [b.key, b.amount])).toEqual([
      ['2025-11', 1_000],
      ['2025-12', 0],
      ['2026-01', 0],
      ['2026-02', 2_000],
    ]);
  });

  it('trên 24 tháng: theo năm', () => {
    const series = buildSpendSeries([e('2022-05-01', 1_000), e('2025-01-02', 2_000)], ALL)!;
    expect(series.unit).toBe('year');
    expect(series.buckets.map((b) => [b.key, b.amount])).toEqual([
      ['2022', 1_000],
      ['2023', 0],
      ['2024', 0],
      ['2025', 2_000],
    ]);
  });
});
