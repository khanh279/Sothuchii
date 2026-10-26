import type { Advance, Contribution, FundData, FundExpense, FundTxn } from '@/types/fund';

import { FUND_INSUFFICIENT_MESSAGE, checkAdvanceGive, checkDirectSpend, defaultExpenseKind, fundCash, maxAdvanceGive } from './fundAdvance';
import { buildFundHistory, filterDaysByPerson, historyMembers } from './fundHistory';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const F = 'f1';
const contrib = (id: string, amount: number, names: string[] = ['Tôi']): Contribution => ({ id, fundId: F, title: 'Đóng', date: '2025-10-01', people: names.map((name) => ({ name, amount: amount / names.length })) });
const expense = (id: string, amount: number, over: Partial<FundExpense> = {}): FundExpense => ({ id, fundId: F, title: id, date: '2025-10-05', amount, ...over });
const advance = (id: string, amount: number, person = 'A'): Advance => ({ id, fundId: F, person, title: 'Ứng', date: '2025-10-03', amount });
const txn = (id: string, kind: FundTxn['kind'], amount: number, over: Partial<FundTxn> = {}): FundTxn => ({ id, fundId: F, kind, person: 'A', amount, date: '2025-10-08', ...over });
const data = (over: Partial<FundData> = {}): FundData => ({ funds: [{ id: F, name: 'Quỹ' }], contribs: [contrib('c1', 1_000_000)], expenses: [], advances: [], txns: [], cur: F, ...over });

describe('hình thức chi mặc định theo số dư', () => {
  it('quỹ hết tiền (0 hoặc âm) → cá nhân ứng chi; còn tiền → chi trực tiếp', () => {
    expect(defaultExpenseKind(0)).toBe('personal');
    expect(defaultExpenseKind(-5)).toBe('personal');
    expect(defaultExpenseKind(1)).toBe('direct');
  });

  it('tiền thực tế trừ tiền đã giao ứng nên quỹ giao hết tiền cũng có mặc định cá nhân ứng', () => {
    const d = data({ advances: [advance('a1', 1_000_000)] });
    expect(fundCash(d, F)).toBe(0);
    expect(defaultExpenseKind(fundCash(d, F))).toBe('personal');
  });
});

describe('checkDirectSpend', () => {
  it('đủ tiền (kể cả đúng bằng) thì được; vượt thì chặn với đúng thông báo', () => {
    expect(checkDirectSpend(data(), F, 1_000_000)).toEqual({ ok: true, amount: 1_000_000 });
    expect(checkDirectSpend(data(), F, 1_000_001)).toEqual({ ok: false, message: FUND_INSUFFICIENT_MESSAGE });
    expect(FUND_INSUFFICIENT_MESSAGE).toBe('Không thể ghi chi tiêu do số dư quỹ không đủ.');
  });

  it('quỹ 0 đồng chặn mọi khoản chi trực tiếp; số ≤ 0 báo nhập số', () => {
    expect(checkDirectSpend(data({ contribs: [] }), F, 1)).toEqual({ ok: false, message: FUND_INSUFFICIENT_MESSAGE });
    expect(checkDirectSpend(data(), F, 0)).toMatchObject({ ok: false });
  });

  it('đang sửa: số cũ của chính khoản chi trực tiếp được hoàn lại; khoản cá nhân ứng không được hoàn', () => {
    const d = data({ expenses: [expense('e1', 600_000), expense('p1', 100_000, { mode: 'personal', payer: 'A' })] });
    expect(fundCash(d, F)).toBe(400_000);
    expect(checkDirectSpend(d, F, 1_000_000, 'e1')).toMatchObject({ ok: true });
    expect(checkDirectSpend(d, F, 1_000_001, 'e1')).toMatchObject({ ok: false });
    expect(checkDirectSpend(d, F, 500_000, 'p1')).toMatchObject({ ok: false });
  });
});

describe('checkAdvanceGive', () => {
  it('đúng bằng số dư thì được, vượt thì chặn và báo số tối đa; 0 vẫn được', () => {
    expect(checkAdvanceGive(data(), F, 1_000_000)).toEqual({ ok: true, amount: 1_000_000 });
    expect(checkAdvanceGive(data(), F, 0)).toEqual({ ok: true, amount: 0 });
    const over = checkAdvanceGive(data(), F, 1_000_001);
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toContain('Số tiền giao vượt quá số dư quỹ');
    expect(checkAdvanceGive(data(), F, -1)).toMatchObject({ ok: false });
  });

  it('số tối đa theo tiền thực tế: đã giao / chi trực tiếp thì giảm, hoàn tiền thì tăng', () => {
    const d = data({ advances: [advance('a1', 300_000)], expenses: [expense('e1', 200_000)], txns: [txn('t1', 'refund', 100_000, { advanceId: 'a1' })] });
    expect(maxAdvanceGive(d, F)).toBe(600_000);
    expect(maxAdvanceGive(d, F, 'a1')).toBe(900_000); // đang sửa a1: tính lại 300.000 đã giao
  });
});

describe('lọc lịch sử quỹ theo thành viên', () => {
  const d = data({
    contribs: [contrib('c1', 1_000_000, ['Tôi', 'An']), contrib('c2', 500_000, ['Bình'])],
    advances: [advance('a1', 200_000, 'Chi')],
    expenses: [expense('e1', 100_000), expense('p1', 50_000, { mode: 'personal', payer: 'An' })],
    txns: [txn('t1', 'payout', 50_000, { expenseId: 'p1', person: 'An' })],
  });
  const history = buildFundHistory(d, F, { mode: 'all' });

  it('danh sách thành viên lấy từ dữ liệu thật (người đóng, người chi / nhận ứng / nhận thanh toán), không trùng', () => {
    expect(historyMembers(history.days)).toEqual(['An', 'Bình', 'Chi', 'Tôi']);
    expect(historyMembers([])).toEqual([]);
  });

  it('chọn thành viên chỉ giữ giao dịch liên quan; chi trực tiếp không thuộc ai', () => {
    const ids = (person: string) => filterDaysByPerson(history.days, person).flatMap((day) => day.entries.map((e) => `${e.kind}:${e.id}`)).sort();
    expect(ids('An')).toEqual(['contribution:c1', 'expense:p1', 'payout:t1']);
    expect(ids('Bình')).toEqual(['contribution:c2']);
    expect(ids('Chi')).toEqual(['advance:a1']);
    expect(ids('Không có')).toEqual([]);
  });

  it('Tất cả (rỗng) khôi phục đủ lịch sử và không đổi dữ liệu gốc', () => {
    const all = filterDaysByPerson(history.days, '');
    expect(all.flatMap((day) => day.entries)).toHaveLength(history.count);
    expect(all).toEqual(history.days);
  });
});
