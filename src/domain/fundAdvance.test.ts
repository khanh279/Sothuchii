import type { Advance, Contribution, FundData, FundExpense, FundTxn } from '@/types/fund';

import { fundBalance } from './funds';
import {
  advanceSummary,
  checkPayout,
  checkRefund,
  combinedPayoutLimit,
  expenseKind,
  fundPersonBalances,
  fundPersonTargets,
  fundPosition,
  personalDebt,
  overflowExpense,
  personalDebtLabel,
  planAdvanceSpend,
  planCombinedPayout,
} from './fundAdvance';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const F = 'f1';
const contrib = (amount: number): Contribution => ({ id: 'c1', fundId: F, title: 'Đóng quỹ', date: '2025-10-01', people: [{ name: 'Tôi', amount }] });
const expense = (id: string, amount: number, over: Partial<FundExpense> = {}): FundExpense => ({ id, fundId: F, title: id, date: '2025-10-05', amount, ...over });
const advance = (id: string, amount: number, person = 'A'): Advance => ({ id, fundId: F, person, title: 'Mua vật tư', date: '2025-10-03', amount });
const txn = (id: string, kind: FundTxn['kind'], amount: number, over: Partial<FundTxn> = {}): FundTxn => ({
  id,
  fundId: F,
  kind,
  person: 'A',
  amount,
  date: '2025-10-08',
  ...over,
});
const data = (over: Partial<FundData> = {}): FundData => ({
  funds: [{ id: F, name: 'Quỹ' }],
  contribs: [contrib(10_000_000)],
  expenses: [],
  advances: [],
  txns: [],
  cur: F,
  ...over,
});

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
    const d = data({
      advances: [adv],
      expenses: [expense('x1', 100_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })],
      txns: [txn('r1', 'refund', 100_000, { advanceId: 'a1' })],
    });
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
      expenses: [expense('d1', 100_000), expense('p1', 300_000, { mode: 'personal', payer: 'A' }), expense('x1', 700_000, { mode: 'advance', payer: 'A', advanceId: 'a1' })],
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

describe('fundPersonTargets (khoản thanh toán của một người)', () => {
  const d = data({
    advances: [advance('a1', 500_000, 'B'), advance('a2', 300_000, 'C')],
    expenses: [
      expense('p1', 300_000, { mode: 'personal', payer: 'A' }),
      expense('p2', 100_000, { mode: 'personal', payer: 'B' }),
      expense('x1', 700_000, { mode: 'advance', payer: 'B', advanceId: 'a1' }),
      expense('x2', 100_000, { mode: 'advance', payer: 'C', advanceId: 'a2' }),
    ],
    txns: [txn('t1', 'payout', 100_000, { expenseId: 'p1' }), txn('t2', 'payout', 50_000, { advanceId: 'a1', person: 'B' })],
  });

  it('liệt kê đúng từng khoản gốc còn phải thanh toán của người đó, không lẫn người khác', () => {
    expect(fundPersonTargets(d, F, 'A').map((x) => [x.kind, x.expenseId ?? x.advanceId, x.remaining])).toEqual([['payout', 'p1', 200_000]]);
    expect(fundPersonTargets(d, F, 'B').map((x) => [x.kind, x.expenseId ?? x.advanceId, x.remaining])).toEqual([
      ['payout', 'p2', 100_000],
      ['payout', 'a1', 150_000], // chi vượt 200.000 đã trả thêm 50.000
    ]);
    expect(fundPersonTargets(d, F, 'C').map((x) => [x.kind, x.advanceId, x.remaining])).toEqual([['refund', 'a2', 200_000]]);
  });

  it('tổng khớp fundPersonBalances; người hết nợ hoặc khác quỹ thì rỗng', () => {
    for (const row of fundPersonBalances(d, F)) {
      const targets = fundPersonTargets(d, F, row.person);
      expect(targets.filter((x) => x.kind === 'payout').reduce((s, x) => s + x.remaining, 0)).toBe(row.owed);
      expect(targets.filter((x) => x.kind === 'refund').reduce((s, x) => s + x.remaining, 0)).toBe(row.held);
    }
    expect(fundPersonTargets(d, 'f-khac', 'A')).toEqual([]);
    expect(fundPersonTargets(d, F, 'Z')).toEqual([]);
  });

  it('mỗi khoản đều qua được kiểm tra thanh toán hiện có với đúng số còn lại', () => {
    for (const x of fundPersonTargets(d, F, 'B')) {
      const check = checkPayout(d, x.expenseId ? { expenseId: x.expenseId } : { advanceId: x.advanceId! }, x.remaining);
      expect(check).toEqual({ ok: true, amount: x.remaining });
    }
  });
});

describe('personalDebtLabel (nhãn trạng thái khoản cá nhân ứng)', () => {
  const fmt = (n: number) => `${n}đ`;
  it('đã trả hết → "Đã quyết toán"', () => {
    expect(personalDebtLabel('paid', 0, fmt)).toBe('Đã quyết toán');
  });
  it('chưa trả → "Còn nợ <số>"', () => {
    expect(personalDebtLabel('unpaid', 300000, fmt)).toBe('Còn nợ 300000đ');
  });
  it('trả một phần → "Đã thanh toán <số đã trả>" (gọn, một dòng); không biết số đã trả thì "Còn nợ <số còn lại>"', () => {
    expect(personalDebtLabel('partial', 100000, fmt, 200000)).toBe('Đã thanh toán 200000đ');
    expect(personalDebtLabel('partial', 100000, fmt)).toBe('Còn nợ 100000đ');
  });
});

describe('thanh toán gộp các khoản quỹ nợ một người', () => {
  // Ba khoản A ứng chi, ngày khác nhau (cố ý khai báo KHÔNG theo thứ tự ngày để kiểm tra việc sắp theo ngày cũ nhất trước).
  const spend = (id: string, amount: number, date: string) => expense(id, amount, { mode: 'personal', payer: 'A', date });
  const base = (cash: number) =>
    data({ contribs: [contrib(cash)], expenses: [spend('p2', 200_000, '2025-10-06'), spend('p1', 100_000, '2025-10-03'), spend('p3', 300_000, '2025-10-09')] });

  it('giới hạn = tổng còn nợ khi quỹ đủ tiền; thiếu tiền thì bằng tiền thực tế của quỹ', () => {
    const rich = base(10_000_000);
    expect(combinedPayoutLimit(rich, fundPersonTargets(rich, F, 'A'))).toBe(600_000);
    const poor = base(250_000);
    expect(combinedPayoutLimit(poor, fundPersonTargets(poor, F, 'A'))).toBe(250_000);
  });

  it('một phần: trả khoản cũ nhất trước rồi lần lượt các khoản sau cho đến hết số tiền', () => {
    const d = base(10_000_000);
    const targets = fundPersonTargets(d, F, 'A');
    const parts = planCombinedPayout(d, targets, 250_000);
    expect(parts.map((part) => [part.target.expenseId, part.amount])).toEqual([
      ['p1', 100_000], // 3/10 cũ nhất: trả hết
      ['p2', 150_000], // 6/10: trả một phần với số còn lại
    ]);
  });

  it('toàn bộ: mỗi khoản trả đúng số còn nợ, theo thứ tự cũ → mới', () => {
    const d = base(10_000_000);
    const parts = planCombinedPayout(d, fundPersonTargets(d, F, 'A'), 600_000);
    expect(parts.map((part) => [part.target.expenseId, part.amount])).toEqual([
      ['p1', 100_000],
      ['p2', 200_000],
      ['p3', 300_000],
    ]);
  });

  it('quỹ thiếu tiền: tổng các phần không vượt tiền thực tế, khoản cũ vẫn được ưu tiên', () => {
    const d = base(250_000);
    const parts = planCombinedPayout(d, fundPersonTargets(d, F, 'A'), 600_000);
    expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(250_000);
    expect(parts[0]).toMatchObject({ amount: 100_000 });
    expect(parts[0].target.expenseId).toBe('p1');
  });
});

describe('planAdvanceSpend — chi từ tiền ứng của một người có nhiều lần giao', () => {
  // A được giao ứng hai lần (cố ý khai báo mới trước cũ); đã chi 200.000 từ lần giao cũ.
  const old = { ...advance('a-old', 500_000), date: '2025-10-03' };
  const fresh = { ...advance('a-new', 300_000), date: '2025-10-09' };
  const d = data({ advances: [fresh, old], expenses: [expense('e1', 200_000, { mode: 'advance', advanceId: 'a-old', payer: 'A' })] });

  it('ưu tiên lần giao cũ nhất trước, phần còn lại sang lần giao mới', () => {
    expect(planAdvanceSpend(d, F, 'A', 400_000)).toEqual([
      { advanceId: 'a-old', fundId: F, amount: 300_000 },
      { advanceId: 'a-new', fundId: F, amount: 100_000 },
    ]);
  });

  it('chi nhỏ hơn số còn giữ của lần cũ thì chỉ vào lần cũ', () => {
    expect(planAdvanceSpend(d, F, 'A', 50_000)).toEqual([{ advanceId: 'a-old', fundId: F, amount: 50_000 }]);
  });

  it('chi vượt tổng tiền ứng còn giữ: phần vượt dồn vào lần giao mới nhất', () => {
    expect(planAdvanceSpend(d, F, 'A', 900_000)).toEqual([
      { advanceId: 'a-old', fundId: F, amount: 300_000 },
      { advanceId: 'a-new', fundId: F, amount: 600_000 },
    ]);
  });

  it('người không có hồ sơ ứng hoặc số tiền 0 → rỗng; tổng các phần luôn bằng số chi', () => {
    expect(planAdvanceSpend(d, F, 'B', 100_000)).toEqual([]);
    expect(planAdvanceSpend(d, F, 'A', 0)).toEqual([]);
    expect(planAdvanceSpend(d, F, 'A', 123_456).reduce((sum, part) => sum + part.amount, 0)).toBe(123_456);
  });
});

describe('overflowExpense — khoản chi làm A chi vượt tiền được giao', () => {
  it('trả khoản mới nhất làm tổng chi vượt tổng đã giao; không vượt thì null', () => {
    const adv: Advance = { id: 'a1', fundId: F, person: 'A', title: 'Ứng', date: '2025-01-01', amount: 500_000 };
    const e = (id: string, date: string, amount: number): FundExpense => ({ id, fundId: F, title: id, date, amount, mode: 'advance', advanceId: 'a1' }) as FundExpense;
    expect(overflowExpense(data({ advances: [adv], expenses: [e('x', '2025-01-02', 300_000)] }), F, 'A')).toBeNull();
    expect(overflowExpense(data({ advances: [adv], expenses: [e('x', '2025-01-02', 300_000), e('y', '2025-01-03', 400_000)] }), F, 'A')?.id).toBe('y');
  });
});
