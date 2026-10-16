import type { Advance, Contribution, FundData, FundExpense, FundTxn } from '@/types/fund';

import { fundBalance } from './funds';
import { advanceSummary, checkPayout, checkRefund, expenseKind, fundPersonBalances, fundPosition, personalDebt } from './fundAdvance';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const F = 'f1';
const contrib = (amount: number): Contribution => ({ id: 'c1', fundId: F, title: 'Đóng quỹ', date: '2025-10-01', people: [{ name: 'Tôi', amount }] });
const expense = (id: string, amount: number, over: Partial<FundExpense> = {}): FundExpense => ({ id, fundId: F, title: id, date: '2025-10-05', amount, ...over });
const advance = (id: string, amount: number, person = 'A'): Advance => ({ id, fundId: F, person, title: 'Mua vật tư', date: '2025-10-03', amount });
const txn = (id: string, kind: FundTxn['kind'], amount: number, over: Partial<FundTxn> = {}): FundTxn => ({ id, fundId: F, kind, person: 'A', amount, date: '2025-10-08', ...over });
const data = (over: Partial<FundData> = {}): FundData => ({ funds: [{ id: F, name: 'Quỹ' }], contribs: [contrib(10_000_000)], expenses: [], advances: [], txns: [], cur: F, ...over });

/** Đẳng thức bắt buộc: số dư (thu − chi) = tiền thực tế + tiền cá nhân giữ − quỹ nợ cá nhân; và số dư khớp công thức có sẵn. */
function expectConsistent(d: FundData) {
  const p = fundPosition(d, F);
  expect(p.balance).toBe(fundBalance(d, F));
  expect(p.balance).toBe(p.cash + p.held - p.owed);
  return p;
}

describe('1. quỹ chi trực tiếp', () => {
  it('giảm số dư và tiền thực tế đúng khoản chi, tăng tổng chi, không có công nợ', () => {
    const p = expectConsistent(data({ expenses: [expense('e1', 400_000)] }));
    expect(p).toMatchObject({ balance: 9_600_000, cash: 9_600_000, spent: 400_000, directSpent: 400_000, owed: 0, held: 0, advanced: false });
  });

  it('dữ liệu cũ (không có trường mới) vẫn là chi trực tiếp', () => {
    expect(expenseKind(expense('e1', 1))).toBe('direct');
    expect(fundPosition({ contribs: [contrib(1000)], expenses: [expense('e1', 400)] }, F)).toMatchObject({ balance: 600, cash: 600 });
  });
});

describe('2–3. cá nhân tự ứng tiền', () => {
  const e = expense('p1', 300_000, { mode: 'personal', payer: 'A' });

  it('ghi chi 300.000 ngay: tổng chi +300.000, quỹ nợ A 300.000, tiền thực tế chưa giảm', () => {
    const d = data({ expenses: [e] });
    const p = expectConsistent(d);
    expect(p).toMatchObject({ spent: 300_000, directSpent: 0, owed: 300_000, cash: 10_000_000, balance: 9_700_000, advanced: true });
    expect(personalDebt(d, e)).toMatchObject({ amount: 300_000, paid: 0, remaining: 300_000, state: 'unpaid' });
  });

  it('thanh toán một phần rồi toàn bộ: chỉ đổi tiền thực tế và công nợ, tổng chi không đổi, khoản chi gốc còn nguyên', () => {
    const partial = data({ expenses: [e], txns: [txn('t1', 'payout', 100_000, { expenseId: 'p1' })] });
    const p1 = expectConsistent(partial);
    expect(p1).toMatchObject({ spent: 300_000, owed: 200_000, cash: 9_900_000, balance: 9_700_000 });
    expect(personalDebt(partial, e)).toMatchObject({ paid: 100_000, remaining: 200_000, state: 'partial' });

    const full = data({ expenses: [e], txns: [txn('t1', 'payout', 100_000, { expenseId: 'p1' }), txn('t2', 'payout', 200_000, { expenseId: 'p1' })] });
    const p2 = expectConsistent(full);
    expect(p2).toMatchObject({ spent: 300_000, owed: 0, cash: 9_700_000, balance: 9_700_000 });
    expect(personalDebt(full, e).state).toBe('paid');
    expect(full.expenses).toEqual([e]); // lịch sử chi không đổi
  });

  it('không cho trả vượt số còn nợ; không cho trả khoản không phải cá nhân ứng', () => {
    const d = data({ expenses: [e, expense('d1', 50_000)], txns: [txn('t1', 'payout', 250_000, { expenseId: 'p1' })] });
    expect(checkPayout(d, { expenseId: 'p1' }, 60_000)).toMatchObject({ ok: false });
    expect(checkPayout(d, { expenseId: 'p1' }, 50_000)).toEqual({ ok: true, amount: 50_000 });
    expect(checkPayout(d, { expenseId: 'p1' }, 0)).toMatchObject({ ok: false });
    expect(checkPayout(d, { expenseId: 'd1' }, 10)).toMatchObject({ ok: false });
  });
});

describe('4–5. quỹ giao tiền ứng trước', () => {
  const adv = advance('a1', 500_000);

  it('giao 500.000: tiền thực tế −500.000, CHƯA tăng tổng chi, trạng thái "chưa quyết toán"', () => {
    const d = data({ advances: [adv] });
    const p = expectConsistent(d);
    expect(p).toMatchObject({ cash: 9_500_000, spent: 0, held: 500_000, owed: 0, balance: 10_000_000 });
    expect(advanceSummary(d, adv)).toMatchObject({ given: 500_000, spent: 0, balance: 500_000, state: 'unsettled' });
  });

  it('chi ít hơn (300.000) rồi hoàn thừa 200.000: tổng chi 300.000, tiền quỹ +200.000, đã quyết toán', () => {
    const afterExpense = data({ advances: [adv], expenses: [expense('x1', 300_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })] });
    const p1 = expectConsistent(afterExpense);
    // chi từ tiền ứng KHÔNG trừ tiền quỹ lần nữa: tiền thực tế vẫn 9.500.000
    expect(p1).toMatchObject({ cash: 9_500_000, spent: 300_000, held: 200_000, owed: 0, balance: 9_700_000 });
    expect(advanceSummary(afterExpense, adv)).toMatchObject({ spent: 300_000, balance: 200_000, held: 200_000, state: 'partial' });

    const settled = data({ ...afterExpense, txns: [txn('r1', 'refund', 200_000, { advanceId: 'a1' })] });
    const p2 = expectConsistent(settled);
    expect(p2).toMatchObject({ cash: 9_700_000, spent: 300_000, held: 0, owed: 0, balance: 9_700_000 });
    expect(advanceSummary(settled, adv)).toMatchObject({ refunded: 200_000, balance: 0, state: 'settled' });
  });

  it('chi đúng số tiền ứng: không thừa không thiếu, đã quyết toán', () => {
    const d = data({ advances: [adv], expenses: [expense('x1', 500_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })] });
    expectConsistent(d);
    expect(advanceSummary(d, adv)).toMatchObject({ spent: 500_000, balance: 0, held: 0, owed: 0, state: 'settled' });
  });

  it('6. chi vượt (700.000 / 500.000): quỹ nợ A 200.000; trả thêm 200.000 thì đã quyết toán, tổng chi không tăng lần hai', () => {
    const over = data({ advances: [adv], expenses: [expense('x1', 700_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })] });
    const p1 = expectConsistent(over);
    expect(p1).toMatchObject({ spent: 700_000, owed: 200_000, held: 0, cash: 9_500_000 });
    expect(advanceSummary(over, adv)).toMatchObject({ balance: -200_000, owed: 200_000, state: 'partial' });

    const paid = data({ ...over, txns: [txn('t1', 'payout', 200_000, { advanceId: 'a1' })] });
    const p2 = expectConsistent(paid);
    expect(p2).toMatchObject({ spent: 700_000, owed: 0, cash: 9_300_000, balance: 9_300_000 });
    expect(advanceSummary(paid, adv)).toMatchObject({ paidExtra: 200_000, balance: 0, state: 'settled' });
  });

  it('7. một hồ sơ có nhiều khoản chi', () => {
    const d = data({
      advances: [adv],
      expenses: [expense('x1', 200_000, { mode: 'advance', payer: 'A', advanceId: 'a1' }), expense('x2', 150_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })],
    });
    expectConsistent(d);
    const s = advanceSummary(d, adv);
    expect(s).toMatchObject({ spent: 350_000, balance: 150_000, state: 'partial' });
    expect(s.expenses).toHaveLength(2);
  });

  it('8. ứng trước bằng 0: không trừ quỹ; chi thì quỹ nợ người đó, trả thì quyết toán', () => {
    const zero = advance('a0', 0, 'B');
    const d0 = data({ advances: [zero] });
    expect(expectConsistent(d0)).toMatchObject({ cash: 10_000_000, held: 0, owed: 0 });
    expect(advanceSummary(d0, zero).state).toBe('unsettled');
    const d1 = data({ advances: [zero], expenses: [expense('y1', 120_000, { mode: 'advance', payer: 'B', advanceId: 'a0' })] });
    expect(expectConsistent(d1)).toMatchObject({ owed: 120_000, spent: 120_000 });
    const d2 = data({ ...d1, txns: [txn('t1', 'payout', 120_000, { advanceId: 'a0', person: 'B' })] });
    expect(advanceSummary(d2, zero).state).toBe('settled');
  });

  it('9. chưa quyết toán hết thì giữ "một phần" và cho cập nhật tiếp; không tự tất toán khi còn chênh lệch', () => {
    const d = data({ advances: [adv], expenses: [expense('x1', 100_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })], txns: [txn('r1', 'refund', 100_000, { advanceId: 'a1' })] });
    expect(advanceSummary(d, adv)).toMatchObject({ balance: 300_000, state: 'partial' });
    const more = data({ ...d, expenses: [...d.expenses, expense('x2', 300_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })] });
    expect(advanceSummary(more, adv)).toMatchObject({ balance: 0, state: 'settled' });
    expectConsistent(more);
  });

  it('hoàn tiền không được vượt số còn giữ', () => {
    const d = data({ advances: [adv], expenses: [expense('x1', 300_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })] });
    expect(checkRefund(d, 'a1', 200_000)).toEqual({ ok: true, amount: 200_000 });
    expect(checkRefund(d, 'a1', 200_001)).toMatchObject({ ok: false });
    expect(checkRefund(d, 'a1', 0)).toMatchObject({ ok: false });
    expect(checkRefund(d, 'khong-co', 1)).toMatchObject({ ok: false });
  });
});

describe('10–12. không tính trùng, lịch sử giữ nguyên', () => {
  it('kịch bản đầy đủ: mọi khoản chi đúng một lần, số dư luôn khớp công thức có sẵn', () => {
    const d = data({
      advances: [advance('a1', 500_000)],
      expenses: [
        expense('d1', 100_000),
        expense('p1', 300_000, { mode: 'personal', payer: 'A' }),
        expense('x1', 700_000, { mode: 'advance', payer: 'A', advanceId: 'a1' }),
      ],
      txns: [txn('t1', 'payout', 300_000, { expenseId: 'p1' }), txn('t2', 'payout', 200_000, { advanceId: 'a1' })],
    });
    const p = expectConsistent(d);
    expect(p.spent).toBe(1_100_000); // 100k + 300k + 700k, thanh toán / giao tiền không cộng thêm
    expect(p.balance).toBe(8_900_000);
    expect(p.owed).toBe(0);
    expect(d.expenses.map((e) => e.id)).toEqual(['d1', 'p1', 'x1']);
  });

  it('chỉ đọc: không đổi dữ liệu truyền vào', () => {
    const d = data({ advances: [advance('a1', 500_000)], expenses: [expense('p1', 300_000, { mode: 'personal', payer: 'A' })] });
    const before = JSON.stringify(d);
    fundPosition(d, 'all');
    advanceSummary(d, d.advances![0]);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('fundPersonBalances (công nợ quỹ theo người)', () => {
  const d = data({
    advances: [advance('a1', 500_000, 'B'), advance('a2', 300_000, 'C')],
    expenses: [
      expense('p1', 300_000, { mode: 'personal', payer: 'A' }),
      expense('p2', 100_000, { mode: 'personal', payer: 'B' }),
      expense('x1', 700_000, { mode: 'advance', payer: 'B', advanceId: 'a1' }), // B chi vượt 200.000
      expense('x2', 100_000, { mode: 'advance', payer: 'C', advanceId: 'a2' }), // C còn giữ 200.000
    ],
    txns: [txn('t1', 'payout', 100_000, { expenseId: 'p1' }), txn('t2', 'payout', 50_000, { advanceId: 'a1', person: 'B' })],
  });

  it('gộp theo từng người: quỹ nợ và số đang giữ; tổng các dòng khớp vị thế quỹ', () => {
    const rows = fundPersonBalances(d, F);
    expect(rows).toEqual([
      { person: 'B', owed: 250_000, held: 0 }, // p2 100.000 + vượt a1 (200.000 − 50.000 đã trả thêm)
      { person: 'A', owed: 200_000, held: 0 }, // 300.000 − 100.000 đã trả
      { person: 'C', owed: 0, held: 200_000 },
    ]);
    const position = fundPosition(d, F);
    expect(rows.reduce((s, r) => s + r.owed, 0)).toBe(position.owed);
    expect(rows.reduce((s, r) => s + r.held, 0)).toBe(position.held);
  });

  it('người đã thanh toán đủ và hồ sơ đã quyết toán không còn trong danh sách; quỹ chỉ chi trực tiếp thì rỗng', () => {
    const paidAll = data({ expenses: [expense('p1', 300_000, { mode: 'personal', payer: 'A' })], txns: [txn('t1', 'payout', 300_000, { expenseId: 'p1' })] });
    expect(fundPersonBalances(paidAll, F)).toEqual([]);
    expect(fundPersonBalances(data({ expenses: [expense('d1', 10)] }), F)).toEqual([]);
  });
});
