import type { LoanLine } from './ledger';
import { isOwedLoan, isPickableLoan, loanKey, loanLineViews, paidLoanViews } from './loanAllocation';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật. Tiền: ĐỒNG. v < 0: tôi vay (tôi nợ); v > 0: tôi trả lại.
const line = (id: string, date: string, v: number, targets?: string[]): LoanLine => ({ id, date, title: id, v, ...(targets ? { targets } : {}) });

describe('loanLineViews', () => {
  const debts = [line('L1', '2025-10-01', -50_000), line('L2', '2025-10-02', -30_000)];

  it('chưa có khoản trả: mọi khoản vay chưa trả, còn lại đủ', () => {
    const views = loanLineViews(debts, -80_000);
    expect(views.map((v) => [v.kind, v.state, v.remaining])).toEqual([['debt', 'unpaid', 50_000], ['debt', 'unpaid', 30_000]]);
  });

  it('khoản trả thường trừ khoản vay cũ nhất trước: L1 trả xong, L2 một phần', () => {
    const views = loanLineViews([...debts, line('R1', '2025-10-03', 60_000)], -20_000);
    expect(views.map((v) => [v.kind, v.state, v.paid, v.remaining])).toEqual([
      ['debt', 'paid', 50_000, 0],
      ['debt', 'partial', 10_000, 20_000],
      ['repay', 'unpaid', 0, 0],
    ]);
  });

  it('khoản trả chọn đích danh trừ đúng khoản đó, không dồn vào khoản cũ hơn', () => {
    const views = loanLineViews([...debts, line('R1', '2025-10-03', 30_000, ['L2'])], -50_000);
    expect(views[0]).toMatchObject({ state: 'unpaid', remaining: 50_000 });
    expect(views[1]).toMatchObject({ state: 'paid', remaining: 0 });
  });

  it('đích danh trả dư thì phần dư trừ tiếp khoản cũ nhất; khoản trả đặt trước khoản vay không trừ khoản vay sau', () => {
    const views = loanLineViews([...debts, line('R1', '2025-10-03', 40_000, ['L2'])], -40_000);
    expect(views.map((v) => v.state)).toEqual(['partial', 'paid', 'unpaid']);
    expect(views[0].remaining).toBe(40_000);
    const early = loanLineViews([line('R0', '2025-09-30', 10_000), ...debts], -70_000);
    expect(early.slice(1).map((v) => v.state)).toEqual(['unpaid', 'unpaid']);
  });

  it('chỉ khoản vay còn nợ và có mã gốc mới chọn được', () => {
    const views = loanLineViews([line('L1', '2025-10-01', -50_000), { date: '2025-10-02', title: 'Gộp nợ', v: -10_000 }, line('R1', '2025-10-03', 50_000)], -10_000);
    expect(views.map(isPickableLoan)).toEqual([false, false, false]); // L1 đã trả đủ, "Gộp nợ" không có mã, R1 là khoản trả
    expect(loanLineViews(debts, -80_000).map(isPickableLoan)).toEqual([true, true]);
  });
});

describe('ngăn xếp đã thanh toán', () => {
  it('khoản đã trả xong và còn nợ phân biệt đúng; khoá ẩn chỉ áp cho khoản có mã', () => {
    const views = loanLineViews([line('L1', '2025-10-01', -50_000), line('L2', '2025-10-02', -30_000), line('R1', '2025-10-03', 60_000)], -20_000);
    expect(views.filter(isOwedLoan).map((v) => v.line.id)).toEqual(['L2']); // L2 còn nợ 20.000; khoản trả R1 không hiện ở danh sách nợ
    expect(paidLoanViews(views, new Set()).map((v) => v.line.id)).toEqual(['L1']);
    expect(loanKey(views[0])).toBe('loan:L1');
    expect(paidLoanViews(views, new Set(['loan:L1']))).toEqual([]); // đã "Xóa lịch sử": ẩn khỏi ngăn xếp, dữ liệu giữ nguyên
  });
});
