import type { FundData } from '@/types/fund';

import { fundSpendBreakdown, settlementOf } from './fundHistory';

// DỮ LIỆU MẪU tự tạo, không phải dữ liệu thật. Tiền là ĐỒNG.
const data: FundData = {
  funds: [{ id: 'f1', name: 'Quỹ lớp' }],
  contribs: [{ id: 'c1', fundId: 'f1', title: 'Đóng quỹ', date: '2025-10-01', people: [{ name: 'An', amount: 2_000_000 }] }],
  expenses: [
    { id: 'd1', fundId: 'f1', title: 'Thuê sân', date: '2025-10-05', amount: 100_000 },
    { id: 'p1', fundId: 'f1', title: 'Mua nước', date: '2025-10-06', amount: 300_000, mode: 'personal', payer: 'An' },
    { id: 'p2', fundId: 'f1', title: 'Mua cờ', date: '2025-10-07', amount: 300_000, mode: 'personal', payer: 'An', fundPart: 120_000 },
    // An được giao 400.000, chi 150.000: còn 250.000 chưa chi.
    { id: 'x1', fundId: 'f1', title: 'In ấn', date: '2025-10-08', amount: 150_000, mode: 'advance', payer: 'An', advanceId: 'a1' },
    // Bình được giao 100.000, chi 130.000: vượt 30.000.
    { id: 'x2', fundId: 'f1', title: 'Mua giấy', date: '2025-10-09', amount: 130_000, mode: 'advance', payer: 'Bình', advanceId: 'a2' },
  ],
  advances: [
    { id: 'a1', fundId: 'f1', person: 'An', title: '', date: '2025-10-03', amount: 400_000 },
    { id: 'a2', fundId: 'f1', person: 'Bình', title: '', date: '2025-10-04', amount: 100_000 },
  ],
  txns: [],
  cur: 'f1',
};
const ALL = { mode: 'all' } as const;

describe('fundSpendBreakdown (chi trong kỳ)', () => {
  it('tách chi trực tiếp, cá nhân ứng chi và giao cá nhân chi theo từng khoản chi; tổng = ba khoản cộng lại', () => {
    const b = fundSpendBreakdown(data, 'all', ALL);
    expect(b).toMatchObject({
      direct: 100_000, // d1
      personal: 300_000 + 300_000, // p1 + p2 (cả khoản đã chia nguồn)
      advance: 150_000 + 130_000, // x1 + x2 (cả phần Bình chi vượt)
      total: 100_000 + 600_000 + 280_000,
    });
    expect(b.personalOwed).toBe(300_000 + 180_000); // p1 + phần cá nhân ứng của p2
    expect(b.personalRemaining).toBe(480_000);
  });

  it('tổng giao là TẤT CẢ tiền quỹ giao trong kỳ, kể cả lần giao chưa phát sinh chi, đã trừ tiền hoàn', () => {
    expect(fundSpendBreakdown(data, 'all', ALL).given).toBe(400_000 + 100_000);
    const more = { ...data, advances: [...(data.advances ?? []), { id: 'a3', fundId: 'f1', person: 'Chi', title: '', date: '2025-10-05', amount: 200_000 }], txns: [{ id: 't1', fundId: 'f1', kind: 'refund' as const, person: 'An', amount: 50_000, date: '2025-10-09', advanceId: 'a1' }] };
    expect(fundSpendBreakdown(more, 'all', ALL).given).toBe(350_000 + 100_000 + 200_000);
  });

  it('tổng khớp tổng mọi khoản chi ghi nhận khi các khoản cùng nằm trong kỳ', () => {
    const spent = data.expenses.reduce((sum, e) => sum + e.amount, 0);
    expect(fundSpendBreakdown(data, 'all', ALL).total).toBe(spent);
  });

  it('chỉ tính các khoản trong kỳ và đúng quỹ được lọc', () => {
    const none = fundSpendBreakdown(data, 'all', { mode: 'month', month: '2025-09' });
    expect(none).toEqual({ direct: 0, personal: 0, advance: 0, total: 0, personalOwed: 0, personalRemaining: 0, given: 0 });
    expect(fundSpendBreakdown(data, 'khac', ALL).total).toBe(0);
  });

  it('settlementOf: đã / chưa / một phần', () => {
    expect(settlementOf(0, 0)).toBe('none');
    expect(settlementOf(100, 0)).toBe('settled');
    expect(settlementOf(100, 100)).toBe('unsettled');
    expect(settlementOf(100, 40)).toBe('partial');
  });
});
