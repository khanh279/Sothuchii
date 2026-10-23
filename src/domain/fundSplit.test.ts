import type { Contribution, FundData, FundExpense, FundTxn } from '@/types/fund';

import { fundBalance } from './funds';
import { buildFundHistory } from './fundHistory';
import { checkPayout, expenseFundPart, fundPersonBalances, fundPersonTargets, fundPosition, personalDebt, planSpendSplit } from './fundAdvance';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const F = 'f1';
const contrib = (amount: number): Contribution => ({ id: 'c1', fundId: F, title: 'Đóng', date: '2025-10-01', people: [{ name: 'An', amount }] });
const split = (over: Partial<FundExpense> = {}): FundExpense => ({ id: 's1', fundId: F, title: 'Mua vật tư', date: '2025-10-05', amount: 350_000, mode: 'personal', payer: 'B', fundPart: 200_000, ...over });
const data = (cash: number, over: Partial<FundData> = {}): FundData => ({ funds: [{ id: F, name: 'Quỹ' }], contribs: cash > 0 ? [contrib(cash)] : [], expenses: [], advances: [], txns: [], cur: F, ...over });
const payout = (amount: number): FundTxn => ({ id: 't1', fundId: F, kind: 'payout', person: 'B', amount, date: '2025-10-08', expenseId: 's1' });

describe('planSpendSplit (quỹ còn 200.000, chi 350.000)', () => {
  it('quỹ không đủ nhưng còn tiền → quỹ chi phần có sẵn, cá nhân ứng phần thiếu', () => {
    expect(planSpendSplit(data(200_000), F, 350_000)).toEqual({ fundPart: 200_000, personalPart: 150_000 });
  });

  it('quỹ đủ (kể cả đúng bằng) hoặc hết tiền thì không chia', () => {
    expect(planSpendSplit(data(350_000), F, 350_000)).toBeNull();
    expect(planSpendSplit(data(500_000), F, 350_000)).toBeNull();
    expect(planSpendSplit(data(0), F, 350_000)).toBeNull();
    expect(planSpendSplit(data(200_000), F, 0)).toBeNull();
  });
});

describe('khoản cá nhân ứng đã chia nguồn tiền', () => {
  const d = data(200_000, { expenses: [split()] });

  it('tiền thực tế giảm đúng 200.000 (phần quỹ chi), quỹ chỉ nợ 150.000, tổng chi tính MỘT lần 350.000', () => {
    const p = fundPosition(d, F);
    expect(p).toMatchObject({ cash: 0, owed: 150_000, held: 0, spent: 350_000, directSpent: 200_000 });
    expect(p.balance).toBe(fundBalance(d, F)); // công thức thu − chi giữ nguyên: 200.000 − 350.000
    expect(p.balance).toBe(p.cash + p.held - p.owed);
  });

  it('công nợ của khoản: chỉ phần cá nhân ứng; thanh toán một phần rồi đủ, không vượt 150.000', () => {
    const e = d.expenses[0];
    expect(expenseFundPart(e)).toBe(200_000);
    expect(personalDebt(d, e)).toMatchObject({ amount: 150_000, paid: 0, remaining: 150_000, state: 'unpaid' });
    const partial = { ...d, txns: [payout(100_000)] };
    expect(personalDebt(partial, e)).toMatchObject({ remaining: 50_000, state: 'partial' });
    const funded = data(500_000, { expenses: [split()] }); // tiền thực tế còn 300.000
    expect(checkPayout(funded, { expenseId: 's1' }, 150_000)).toEqual({ ok: true, amount: 150_000 });
    expect(checkPayout(funded, { expenseId: 's1' }, 150_001)).toMatchObject({ ok: false });
    const paid = fundPosition({ ...d, txns: [payout(150_000)] }, F);
    expect(paid).toMatchObject({ cash: -150_000, owed: 0, spent: 350_000 }); // quỹ trả tiền mặt cho B: đúng số tiền thật rời quỹ
  });

  it('công nợ theo người và khoản thanh toán chỉ tính phần cá nhân ứng', () => {
    expect(fundPersonBalances(d, F)).toEqual([{ person: 'B', owed: 150_000, held: 0 }]);
    expect(fundPersonTargets(d, F, 'B').map((x) => [x.kind, x.expenseId, x.remaining])).toEqual([['payout', 's1', 150_000]]);
  });

  it('khoản cá nhân ứng KHÔNG chia (như cũ) vẫn nợ đủ số tiền và không lấy tiền khỏi quỹ lúc ghi', () => {
    const plain = data(200_000, { expenses: [split({ fundPart: undefined })] });
    expect(fundPosition(plain, F)).toMatchObject({ cash: 200_000, owed: 350_000 });
  });

  it('trường fundPart không hợp lệ bị bỏ qua (≥ tổng hoặc khoản không phải cá nhân ứng)', () => {
    expect(expenseFundPart({ mode: 'personal', amount: 100, fundPart: 100 })).toBe(0);
    expect(expenseFundPart({ mode: 'personal', amount: 100, fundPart: 0 })).toBe(0);
    expect(expenseFundPart({ mode: undefined, amount: 100, fundPart: 50 })).toBe(0);
  });
});

describe('lịch sử khoản đã chia nguồn tiền', () => {
  it('một dòng với tổng 350.000 và hai nguồn tiền; không có số dư sau giao dịch; không cộng trùng tổng chi', () => {
    const h = buildFundHistory(data(200_000, { expenses: [split(), { id: 'e2', fundId: F, title: 'Chi thường', date: '2025-10-04', amount: 10_000 }] }), F, { mode: 'all' });
    const entries = h.days.flatMap((day) => day.entries);
    expect(entries.filter((e) => e.kind === 'expense')).toHaveLength(2);
    const s = entries.find((e) => e.id === 's1')!;
    expect(s).toMatchObject({ amount: 350_000, split: { fund: 200_000, personal: 150_000 } });
    expect(s.split!.fund + s.split!.personal).toBe(s.amount);
    expect(entries.find((e) => e.id === 'e2')!.split).toBeUndefined();
    expect(h.totalOut).toBe(360_000); // 350.000 + 10.000, mỗi khoản đúng một lần
  });
});
