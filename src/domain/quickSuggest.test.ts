import { suggestFromHistory } from '@/domain/quickSuggest';

describe('suggestFromHistory', () => {
  const items = [
    { title: 'Phở sáng', amount: 45000, date: '2026-10-01' },
    { title: 'phở  sáng ', amount: 50000, date: '2026-10-05' },
    { title: 'Cà phê', amount: 30000, date: '2026-10-06' },
    { title: 'Xăng', amount: 80000, date: '2026-09-20' },
    { title: '', amount: 10000, date: '2026-10-06' },
    { title: 'Lỗi', amount: 0, date: '2026-10-06' },
  ];

  it('gộp theo nội dung, lấy số tiền lần gần nhất và xếp theo số lần dùng', () => {
    const result = suggestFromHistory(items);
    expect(result.map((s) => s.title)).toEqual(['phở sáng', 'Cà phê', 'Xăng']);
    expect(result[0]).toMatchObject({ amount: 50000, count: 2, lastDate: '2026-10-05' });
  });

  it('bỏ nội dung trống và số tiền không dương', () => {
    expect(suggestFromHistory(items).some((s) => s.title === 'Lỗi' || s.title === '')).toBe(false);
  });

  it('lọc theo chữ đang gõ và giới hạn số lượng', () => {
    expect(suggestFromHistory(items, 6, 'CÀ').map((s) => s.title)).toEqual(['Cà phê']);
    expect(suggestFromHistory(items, 1)).toHaveLength(1);
    expect(suggestFromHistory([])).toEqual([]);
  });
});
