import type { BillPairItem } from './billPairs';
import type { LoanLine } from './ledger';
import { loanLineViews } from './loanAllocation';
import { isPickableBill, pickedNote, summarizePicked } from './pickedPayment';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const item = (billId: string, remaining: number, over: Partial<BillPairItem> = {}): BillPairItem => ({ billId, title: billId, date: '2025-10-01', amount: remaining, paid: 0, remaining, state: 'unpaid', offset: false, ...over });
const pair = { from: 'Tôi', to: 'An' }; // tôi nợ An
const line = (id: string, v: number): LoanLine => ({ id, date: '2025-10-01', title: id, v });
const base = { owner: 'Tôi', pair, billItems: [item('B1', 30_000), item('B2', 20_000), item('B3', 10_000, { offset: true })], loanViews: [] as ReturnType<typeof loanLineViews>, loanNet: 0, pickedBills: new Set<string>(), pickedLoans: new Set<number>() };

describe('summarizePicked', () => {
  it('chưa chọn gì: không hợp lệ, không lý do', () => {
    expect(summarizePicked(base)).toMatchObject({ ok: false, count: 0, direction: null, total: 0 });
  });

  it('chọn bill: tổng số còn lại của đúng các bill đó, chiều tôi trả', () => {
    expect(summarizePicked({ ...base, pickedBills: new Set(['B1', 'B2']) })).toMatchObject({
      ok: true,
      direction: 'owe',
      bill: { from: 'Tôi', to: 'An', billIds: ['B1', 'B2'], titles: ['B1', 'B2'], amount: 50_000 },
      loan: null,
      total: 50_000,
    });
  });

  it('khoản bù trừ không chọn được và bị bỏ qua', () => {
    expect(isPickableBill(base.billItems[2])).toBe(false);
    expect(summarizePicked({ ...base, pickedBills: new Set(['B3']) })).toMatchObject({ ok: false, count: 0 });
  });

  it('chọn khoản vay: tổng số còn lại của đúng các khoản đã chọn, kèm mã khoản gốc', () => {
    const loanViews = loanLineViews([line('L1', -40_000), line('L2', -10_000)], -50_000);
    const result = summarizePicked({ ...base, loanViews, loanNet: -50_000, pickedLoans: new Set([1]) });
    expect(result).toMatchObject({ ok: true, direction: 'owe', loan: { amount: 10_000, ids: ['L2'], titles: ['L2'] }, total: 10_000 });
    expect(summarizePicked({ ...base, loanViews, loanNet: -50_000, pickedLoans: new Set([0, 1]) }).total).toBe(50_000);
  });

  it('khoản trả (ngược chiều) và khoản không có mã không chọn được', () => {
    const loanViews = loanLineViews([line('L1', -40_000), line('R1', 10_000), { date: '2025-10-03', title: 'Gộp nợ', v: -5_000 }], -35_000);
    expect(summarizePicked({ ...base, loanViews, loanNet: -35_000, pickedLoans: new Set([1, 2]) })).toMatchObject({ ok: false, count: 0 });
  });

  it('bill và vay cùng chiều: cộng hai phần; ngược chiều: không hợp lệ kèm lý do', () => {
    const loanViews = loanLineViews([line('L1', -40_000)], -40_000);
    const both = summarizePicked({ ...base, loanViews, loanNet: -40_000, pickedBills: new Set(['B1']), pickedLoans: new Set([0]) });
    expect(both).toMatchObject({ ok: true, total: 70_000 });
    expect(pickedNote(both)).toBe('Thanh toán 1 bill, 1 khoản vay đã chọn');
    expect(pickedNote(summarizePicked({ ...base, pickedBills: new Set(['B1', 'B2']) }))).toBe('Thanh toán 2 bill đã chọn');
    expect(pickedNote(summarizePicked({ ...base, loanViews, loanNet: -40_000, pickedLoans: new Set([0]) }))).toBe('Thanh toán 1 khoản vay đã chọn');
    const getViews = loanLineViews([line('L9', 40_000)], 40_000);
    const result = summarizePicked({ ...base, loanViews: getViews, loanNet: 40_000, pickedBills: new Set(['B1']), pickedLoans: new Set([0]) });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cùng chiều/);
  });
});
