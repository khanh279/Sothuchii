import type { Advance, Contribution, FundData, FundExpense, FundTxn } from '@/types/fund';

import { checkAdvanceGive, checkDirectSpend, fundCash } from './fundAdvance';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const F = 'f1';
const contrib = (id: string, amount: number, names: string[] = ['Tôi']): Contribution => ({ id, fundId: F, title: 'Đóng', date: '2025-10-01', people: names.map((name) => ({ name, amount: amount / names.length })) });
const expense = (id: string, amount: number, over: Partial<FundExpense> = {}): FundExpense => ({ id, fundId: F, title: id, date: '2025-10-05', amount, ...over });
const advance = (id: string, amount: number, person = 'A'): Advance => ({ id, fundId: F, person, title: 'Ứng', date: '2025-10-03', amount });
const txn = (id: string, kind: FundTxn['kind'], amount: number, over: Partial<FundTxn> = {}): FundTxn => ({ id, fundId: F, kind, person: 'A', amount, date: '2025-10-08', ...over });
const data = (over: Partial<FundData> = {}): FundData => ({ funds: [{ id: F, name: 'Quỹ' }], contribs: [contrib('c1', 1_000_000)], expenses: [], advances: [], txns: [], cur: F, ...over });

describe('số còn lại thực tế của quỹ = thu − mọi khoản chi ghi nhận', () => {
  it('chi trực tiếp, cá nhân ứng chi và phần cá nhân đã chi từ tiền ứng đều làm giảm; giao ứng chưa chi, hoàn tiền, quỹ trả thì không đổi', () => {
    expect(fundCash(data(), F)).toBe(1_000_000);
    expect(fundCash(data({ expenses: [expense('e1', 200_000)] }), F)).toBe(800_000);
    expect(fundCash(data({ expenses: [expense('p1', 100_000, { mode: 'personal', payer: 'A' })] }), F)).toBe(900_000);
    const advanced = data({ advances: [advance('a1', 300_000)] });
    expect(fundCash(advanced, F)).toBe(1_000_000);
    const spent = data({ advances: [advance('a1', 300_000)], expenses: [expense('s1', 120_000, { mode: 'advance', advanceId: 'a1', payer: 'A' })] });
    expect(fundCash(spent, F)).toBe(880_000);
    const settled = { ...spent, txns: [txn('t1', 'refund', 180_000, { advanceId: 'a1' }), txn('t2', 'payout', 50_000, { expenseId: 'none' })] };
    expect(fundCash(settled, F)).toBe(880_000);
  });

  it('số dư có thể âm và không còn hình thức chi nào bị khoá theo số dư', () => {
    expect(fundCash(data({ contribs: [], expenses: [expense('e1', 50_000)] }), F)).toBe(-50_000);
  });
});

describe('kiểm tra số tiền khi chi / giao ứng (không chặn theo số dư quỹ)', () => {
  it('chi quỹ chỉ cần số tiền > 0, kể cả khi quỹ hết tiền', () => {
    expect(checkDirectSpend(1_000_001)).toEqual({ ok: true, amount: 1_000_001 });
    expect(checkDirectSpend(0)).toMatchObject({ ok: false });
    expect(checkDirectSpend(-5)).toMatchObject({ ok: false });
  });

  it('giao ứng: ≥ 0 là hợp lệ (0 = giao việc chưa cấp tiền), không bị chặn bởi số dư; âm hoặc không phải số thì báo lỗi', () => {
    expect(checkAdvanceGive(5_000_000)).toEqual({ ok: true, amount: 5_000_000 });
    expect(checkAdvanceGive(0)).toEqual({ ok: true, amount: 0 });
    expect(checkAdvanceGive(-1)).toMatchObject({ ok: false });
    expect(checkAdvanceGive(Number.NaN)).toMatchObject({ ok: false });
  });
});
