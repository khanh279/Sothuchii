import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { MERGED_PAY_LABEL } from './billAllocation';
import { billPayState, billSettled, billTransferStatuses } from './billPayment';
import { buildBillPairs, buildBillPairsFor } from './billPairs';
import { pairAmountDraft } from './billPerson';
import { finalizeNewPays } from './ledger';
import { buildPayHistory } from './payForm';
import { buildTransactionEntries, filterTransactions } from './transactionList';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const OCT = { mode: 'month' as const, month: '2025-10' };

const B0 = bill('B0', '2025-09-20', 1, [p('Tôi', 0), p('An', 100_000)]); // tôi nợ An 50 (cũ nhất, KHÔNG chọn để gộp)
const B1 = bill('B1', '2025-10-01', 2, [p('Tôi', 0), p('An', 60_000)]); // tôi nợ An 30
const B2 = bill('B2', '2025-10-03', 3, [p('Tôi', 0), p('An', 40_000)]); // tôi nợ An 20
const B3 = bill('B3', '2025-10-05', 4, [p('Tôi', 40_000), p('An', 0)]); // An nợ tôi 20 (chiều ngược lại)

/**
 * Ghi một khoản trả `Tôi → An` bằng đúng đường đi của dịch vụ. `targetIds` = các bill được chọn (khoản trả từ bill gộp / chi tiết bill, có nhãn
 * `MERGED_PAY_LABEL`); bỏ trống = khoản trả thường (không nhắm bill nào).
 */
function payAn(existing: readonly Pay[], amount: number, remaining: number, targetIds?: readonly string[]): Pay[] {
  const base = pairAmountDraft({ from: 'Tôi', to: 'An', remaining }, amount);
  if (!base) throw new Error('bản nháp không hợp lệ');
  const draft = targetIds ? { ...base, lbl: MERGED_PAY_LABEL, bills: [...targetIds] } : base;
  let n = 0;
  const created = finalizeNewPays([draft], { now: 1_000 + existing.length, today: '2025-10-10', newId: () => `pay${existing.length + n++}` });
  return [...existing, ...created];
}

describe('thanh toán bill gộp: chỉ trừ vào bill đã chọn, bill cũ trước bill mới sau', () => {
  const bills = [B1, B2];
  const ids = ['B1', 'B2'];

  it('trả hết số còn lại: mọi khoản chuyển thành "paid", bill được tính là đã thanh toán, cặp biến mất', () => {
    const before = buildBillPairsFor(bills, [], ids);
    expect(before.map((x) => [x.from, x.to, x.remaining])).toEqual([['Tôi', 'An', 50_000]]);

    const pays = payAn([], 50_000, before[0].remaining, ids);
    expect(buildBillPairsFor(bills, pays, ids)).toEqual([]);
    const statuses = billTransferStatuses(bills, pays);
    expect(billSettled(statuses.get('B1'))).toBe(true);
    expect(billSettled(statuses.get('B2'))).toBe(true);
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'paid', paid: 30_000, remaining: 0 });
    // Nợ bill ở tab Nợ & bill (theo kỳ) cũng hết.
    expect(buildBillPairs(bills, pays, OCT)).toEqual([]);
  });

  it('trả một phần: bill cũ trong số đã chọn trả xong trước, bill mới sau ở trạng thái một phần', () => {
    const pays = payAn([], 40_000, 50_000, ids);
    const statuses = billTransferStatuses(bills, pays);
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'paid', remaining: 0 });
    expect(statuses.get('B2')![0]).toMatchObject({ state: 'partial', paid: 10_000, remaining: 10_000 });
    expect(buildBillPairsFor(bills, pays, ids)[0]).toMatchObject({ remaining: 10_000, partial: true });
  });

  it('thứ tự theo ngày bill, không theo thứ tự chọn', () => {
    const pays = payAn([], 25_000, 50_000, ['B2', 'B1']);
    const statuses = billTransferStatuses(bills, pays);
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'partial', paid: 25_000 });
    expect(statuses.get('B2')![0]).toMatchObject({ state: 'unpaid', paid: 0 });
  });

  it('khoản trả được ghi thành giao dịch: có ở lịch sử trả, ở danh sách giao dịch (mục Chuyển tiền & bill), là khoản trả bill và mang tên các bill', () => {
    const pays = payAn([], 50_000, 50_000, ids);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ from: 'Tôi', to: 'An', amt: 50_000, kind: 'billpay', lbl: MERGED_PAY_LABEL, bills: ids });

    const rows = buildPayHistory(pays, bills, OCT).days.flatMap((day) => day.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: MERGED_PAY_LABEL, detail: 'B1, B2' });
    const entries = buildTransactionEntries({ expenses: [], payRows: rows, pays });
    expect(filterTransactions(entries, 'bill')).toHaveLength(1);
    expect(filterTransactions(entries, 'loanBill')).toHaveLength(1);
    expect(filterTransactions(entries, 'loan')).toHaveLength(0);
    expect(filterTransactions(entries, 'all')).toHaveLength(1);
  });
});

describe('thanh toán bill gộp KHÔNG tràn sang bill cũ hơn không được chọn', () => {
  const bills = [B0, B1, B2];
  const ids = ['B1', 'B2'];

  it('trả đúng số hiện ở bill gộp thì bill gộp về 0, bill cũ không chọn giữ nguyên nợ', () => {
    const remaining = buildBillPairsFor(bills, [], ids)[0].remaining;
    expect(remaining).toBe(50_000);
    const pays = payAn([], remaining, remaining, ids);
    const statuses = billTransferStatuses(bills, pays);
    expect(statuses.get('B0')![0]).toMatchObject({ state: 'unpaid', paid: 0, remaining: 50_000 });
    expect(billSettled(statuses.get('B1'))).toBe(true);
    expect(billSettled(statuses.get('B2'))).toBe(true);
    expect(buildBillPairsFor(bills, pays, ids)).toEqual([]);
  });

  it('khoản trả thường (không nhắm bill) vẫn theo quy tắc cũ "bill cũ trước" trên mọi bill', () => {
    const pays = payAn([], 50_000, 50_000);
    const statuses = billTransferStatuses(bills, pays);
    expect(statuses.get('B0')![0]).toMatchObject({ state: 'paid' });
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'unpaid' });
  });

  it('khoản trả cũ có `bills` nhưng nhãn khác (ví dụ "Thanh toán bill") không bị ảnh hưởng: vẫn bill cũ trước', () => {
    const legacy: Pay = { id: 'old', createdAt: 5_000, date: '2025-10-10', note: '', from: 'Tôi', to: 'An', amt: 50_000, kind: 'repay', lbl: 'Thanh toán bill', bills: ['B1', 'B2'] };
    const statuses = billTransferStatuses(bills, [legacy]);
    expect(statuses.get('B0')![0]).toMatchObject({ state: 'paid' });
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'unpaid' });
  });
});

describe('thanh toán bill gộp chỉ trừ đúng cặp A → B', () => {
  it('khoản chuyển chiều ngược lại (An → Tôi) trong các bill chọn không bị trừ; trả hết chiều Tôi → An', () => {
    const bills = [B1, B2, B3];
    const ids = ['B1', 'B2', 'B3'];
    const pair = buildBillPairsFor(bills, [], ids)[0];
    expect(pair).toMatchObject({ from: 'Tôi', to: 'An', remaining: 30_000 }); // 30 + 20 − 20 bù trừ
    const pays = payAn([], 30_000, pair.remaining, ids);
    const statuses = billTransferStatuses(bills, pays);
    expect(statuses.get('B3')![0]).toMatchObject({ from: 'An', to: 'Tôi', state: 'unpaid', paid: 0 }); // chiều ngược lại không bị đụng
    expect(statuses.get('B1')![0]).toMatchObject({ state: 'paid' });
    // Bill cũ nhất trong số chọn (B1, 30) trả trước; B2 (20) chưa tới lượt. Số bù trừ chiều ngược lại làm cặp ròng về 0.
    expect(statuses.get('B2')![0]).toMatchObject({ from: 'Tôi', to: 'An', state: 'unpaid', remaining: 20_000 });
    expect(buildBillPairsFor(bills, pays, ids)).toEqual([]);
  });
});

describe('cặp đã trả xong (để gạch ngang ở bill gộp)', () => {
  it('includeSettled: cặp trả xong vẫn có mặt với số còn lại 0; cặp trả một phần giữ số ban đầu', () => {
    const bills = [B1, B2];
    const ids = ['B1', 'B2'];
    expect(buildBillPairsFor(bills, [], ids, true)[0]).toMatchObject({ from: 'Tôi', to: 'An', amount: 50_000, remaining: 50_000 });
    const partial = payAn([], 40_000, 50_000, ids);
    expect(buildBillPairsFor(bills, partial, ids, true)[0]).toMatchObject({ amount: 50_000, remaining: 10_000, partial: true });
    const full = payAn([], 50_000, 50_000, ids);
    expect(buildBillPairsFor(bills, full, ids)).toEqual([]);
    expect(buildBillPairsFor(bills, full, ids, true)[0]).toMatchObject({ from: 'Tôi', to: 'An', amount: 50_000, remaining: 0, partial: false });
  });
});

describe('trạng thái bill ở danh sách (billPayState)', () => {
  const bills = [B1, B2, B3];

  it('chưa có giao dịch trả: chưa thanh toán; trả một phần hoặc đã trả xong một khoản mà bill còn khoản khác: thanh toán một phần; trả hết: đã thanh toán', () => {
    const stateOf = (pays: Pay[], id: string) => billPayState(billTransferStatuses(bills, pays).get(id));
    expect(stateOf([], 'B1')).toBe('unpaid');
    const partial = payAn([], 10_000, 50_000, ['B1', 'B2']);
    expect(stateOf(partial, 'B1')).toBe('partial'); // đã có giao dịch trả vào B1 (10 / 30)
    expect(stateOf(partial, 'B2')).toBe('unpaid'); // chưa tới lượt B2
    const full = payAn([], 50_000, 50_000, ['B1', 'B2']);
    expect(stateOf(full, 'B1')).toBe('paid');
    expect(stateOf(full, 'B2')).toBe('paid');
  });

  it('bill không có khoản nào cần chuyển được tính là đã thanh toán', () => {
    expect(billPayState(undefined)).toBe('paid');
    expect(billPayState([])).toBe('paid');
  });
});
