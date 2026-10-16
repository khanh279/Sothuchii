import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { buildDebtDetail, buildPairDetail, groupByDay, groupByMonth, isMonthMode, ledgerSubtitle, toneOf } from './debtDetail';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[], title = id): Bill => ({ id, title, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, ...over });

// B1: Tôi nợ An 30, Bình nợ An 30. B2: An nợ tôi 20. Cho An vay 50.
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 90), p('Bình', 0)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40), p('An', 0)]);
const LOAN = pay('L1', 'Tôi', 'An', 50, { kind: 'vay', date: '2025-10-02' });
const bills = [B1, B2];
const month = { mode: 'month' as const, month: '2025-10' };

describe('tiện ích', () => {
  it('màu theo dấu, kỳ theo từng ngày hay theo tháng, dòng phụ ngăn', () => {
    expect([10, -10, 0, 0.0004, -0.0004].map(toneOf)).toEqual(['get', 'owe', 'mid', 'mid', 'mid']);
    expect(isMonthMode(month)).toBe(true);
    expect(isMonthMode({ mode: 'custom', from: '2025-10-01', to: '2025-10-20' })).toBe(true);
    expect(isMonthMode({ mode: 'custom', from: '2025-09-20', to: '2025-10-20' })).toBe(false);
    expect(isMonthMode({ mode: 'year', year: 2025 })).toBe(false);
    expect(isMonthMode({ mode: 'all' })).toBe(false);
    expect(ledgerSubtitle(0.04, 'An')).toBe('Đã thanh toán xong');
    expect(ledgerSubtitle(5, 'An')).toBe('An nợ tôi');
    expect(ledgerSubtitle(-5, 'An')).toBe('Tôi nợ An');
  });

  it('gom theo ngày và tháng: tổng làm tròn từng đồng', () => {
    const rows = [
      { d: '2025-10-01', v: 0.1, t: 'a', s: '', tone: 'get' as const },
      { d: '2025-10-01', v: 0.2, t: 'b', s: '', tone: 'get' as const },
      { d: '2025-11-05', v: -5, t: 'c', s: '', tone: 'owe' as const },
    ];
    expect(groupByDay(rows).map((g) => [g.date, g.net, g.tone, g.rows.length])).toEqual([['2025-10-01', 0.3, 'get', 2], ['2025-11-05', -5, 'owe', 1]]);
    expect(groupByMonth(rows).map((g) => [g.month, g.net, g.count])).toEqual([['2025-10', 0.3, 2], ['2025-11', -5, 1]]);
  });

  it('chi tiết cặp: dòng đầu trung tính thì cả ngày trung tính', () => {
    const mid = [{ d: '2025-10-01', v: 5, t: 'a', s: '', tone: 'mid' as const }];
    expect(groupByDay(mid, true)[0].tone).toBe('mid');
    expect(groupByMonth(mid, true)[0].tone).toBe('mid');
    expect(groupByDay(mid, false)[0].tone).toBe('get');
  });
});

describe('buildDebtDetail (một người)', () => {
  it('số dư toàn thời gian ở hai sổ; ngăn vay liệt kê mọi dòng; hai sổ trái dấu thì chỉ có Gộp nợ (chưa có Thanh toán)', () => {
    const d = buildDebtDetail(bills, [LOAN], 'An', month);
    expect(d).toMatchObject({ name: 'An', loan: 50, bill: -10, hasLoan: true, hasBill: true, settled: false, loanSubtitle: 'An nợ tôi', billSubtitle: 'Tôi nợ An' });
    expect(d.loanRows.map((r) => [r.t, r.v, r.tone])).toEqual([['Tôi cho An vay', 50, 'get']]);
    expect(d.payActions).toEqual([]);
    expect(d).toMatchObject({ canMerge: true, mergeAmount: 10, canPay: false });
  });

  it('bill trong kỳ tháng: theo ngày, có dòng tổng của kỳ', () => {
    const d = buildDebtDetail(bills, [LOAN], 'An', month);
    expect(d.monthMode).toBe(true);
    expect(d.billMonths).toEqual([]);
    expect(d.billPeriodTotal).toBe(-10);
    expect(d.billDays.map((g) => [g.date, g.net, g.tone])).toEqual([['2025-10-01', -30, 'owe'], ['2025-10-03', 20, 'get']]);
    expect(d.billDays[0].rows[0]).toMatchObject({ t: 'B1', s: 'Bill', v: -30 });
  });

  it('kỳ "Tất cả" hoặc nhiều tháng: theo tháng, kỳ "Tất cả" không có dòng tổng', () => {
    const all = buildDebtDetail(bills, [LOAN], 'An', { mode: 'all' }, () => 'Ăn uống');
    expect(all.monthMode).toBe(false);
    expect(all.billPeriodTotal).toBeNull();
    expect(all.billDays).toEqual([]);
    expect(all.billMonths.map((m) => [m.month, m.net, m.count, m.days.length])).toEqual([['2025-10', -10, 2, 2]]);
    expect(all.billMonths[0].days[0].rows[0].s).toBe('Ăn uống');
    expect(buildDebtDetail(bills, [LOAN], 'An', { mode: 'year', year: 2025 }).billPeriodTotal).toBe(-10);
  });

  it('kỳ không có bill: ngăn bill vẫn hiện (từng có biến động) nhưng danh sách trống; số dư không đổi theo kỳ', () => {
    const d = buildDebtDetail(bills, [LOAN], 'An', { mode: 'month', month: '2025-09' });
    expect(d).toMatchObject({ hasBill: true, billEmpty: true, bill: -10, billPeriodTotal: 0 });
  });

  it('ẩn sổ về 0: chỉ hiện sổ còn nợ; hai sổ cùng dấu thì có Thanh toán cho cả hai', () => {
    const same = buildDebtDetail([B1], [pay('x', 'An', 'Tôi', 40, { kind: 'vay' })], 'An', month);
    expect(same).toMatchObject({ loan: -40, bill: -30, hasLoan: true, hasBill: true, canMerge: false, canPay: true });
    expect(same.payActions.map((a) => a.ledger)).toEqual(['loan', 'bill']);
    const onlyLoan = buildDebtDetail([], [LOAN], 'An', month);
    expect(onlyLoan).toMatchObject({ hasLoan: true, hasBill: false, settled: false, canPay: true });
    expect(onlyLoan.payActions.map((a) => a.ledger)).toEqual(['loan']);
    // Vay về 0 do thanh toán đủ: ẩn ngăn vay, bill vẫn hiện.
    const loanDone = buildDebtDetail([B1], [pay('a', 'Tôi', 'An', 30, { kind: 'vay' }), pay('b', 'An', 'Tôi', 30, { kind: 'vay' })], 'An', month);
    expect(loanDone).toMatchObject({ loan: 0, hasLoan: false, hasBill: true, canMerge: false });
    // Giao dịch mới làm sổ khác 0 trở lại thì ngăn xuất hiện lại.
    const again = buildDebtDetail([B1], [pay('a', 'Tôi', 'An', 30, { kind: 'vay' }), pay('b', 'An', 'Tôi', 30, { kind: 'vay' }), pay('c', 'An', 'Tôi', 5, { kind: 'vay', createdAt: 99 })], 'An', month);
    expect(again).toMatchObject({ loan: -5, hasLoan: true });
  });

  it('hai sổ trái dấu có tổng bằng 0 vẫn gộp được (và ẩn cả hai sau khi gộp)', () => {
    const pays = [pay('x', 'Tôi', 'An', 30, { kind: 'vay' })];
    const before = buildDebtDetail([B1], pays, 'An', month);
    expect(before).toMatchObject({ loan: 30, bill: -30, canMerge: true, mergeAmount: 30, canPay: false, settled: false });
    const merged = buildDebtDetail([B1], [
      ...pays,
      pay('m1', 'An', 'Tôi', 30, { kind: 'bt', led: 'loan', grp: 'g1', createdAt: 20 }),
      pay('m2', 'Tôi', 'An', 30, { kind: 'bt', led: 'bill', grp: 'g1', createdAt: 21 }),
    ], 'An', month);
    expect(merged).toMatchObject({ loan: 0, bill: 0, hasLoan: false, hasBill: false, settled: true, canMerge: false, canPay: false });
    expect(merged.history).toHaveLength(1);
  });

  it('người đã thanh toán xong hoặc không có biến động', () => {
    const settled = buildDebtDetail([], [pay('a', 'Tôi', 'An', 10, { kind: 'vay' }), pay('b', 'An', 'Tôi', 10, { kind: 'vay' })], 'An', month);
    expect(settled).toMatchObject({ settled: true, hasLoan: false, hasBill: false, payActions: [], canMerge: false, canPay: false, loanSubtitle: 'Đã thanh toán xong' });
    expect(buildDebtDetail(bills, [], 'Chi', month)).toMatchObject({ settled: true, hasLoan: false, hasBill: false });
  });

  it('lịch sử gộp nợ theo người, mới nhất trước', () => {
    const pays = [
      LOAN,
      pay('m1', 'An', 'Tôi', 10, { kind: 'bt', led: 'loan', grp: 'g1', createdAt: 20 }),
      pay('m2', 'Tôi', 'An', 10, { kind: 'bt', led: 'bill', grp: 'g1', createdAt: 21 }),
    ];
    const d = buildDebtDetail(bills, pays, 'An', month);
    expect(d.history).toEqual([{ id: 'g1', date: '2025-10-05', createdAt: 20, loan: 10, bill: 10 }]);
    expect(d).toMatchObject({ loan: 40, bill: 0, hasBill: false, canMerge: false });
    expect(d.payActions.map((a) => a.ledger)).toEqual(['loan']);
  });

  it('không sửa đầu vào', () => {
    const copy = JSON.parse(JSON.stringify({ bills, LOAN }));
    buildDebtDetail(bills, [LOAN], 'An', month);
    buildPairDetail(bills, [LOAN], 'Tôi', 'An', month);
    expect({ bills, LOAN }).toEqual(copy);
  });
});

describe('buildPairDetail (một cặp)', () => {
  it('cặp có tôi: nhãn, màu, số tiền, dòng có dấu theo chiều của tôi; có thể thanh toán và gộp nợ', () => {
    const d = buildPairDetail(bills, [LOAN], 'Tôi', 'An', { mode: 'all' });
    expect(d).toMatchObject({ empty: false, label: 'Tôi nợ An', tone: 'owe', amount: 10, canPay: true, other: 'An', canMerge: true, mergeAmount: 10, monthMode: false });
    expect(d.months).toHaveLength(1);
    expect(d.months[0].days.flatMap((g) => g.rows.map((r) => [r.t, r.v, r.tone]))).toEqual([['B1', -30, 'owe'], ['B2', 20, 'get']]);
  });

  it('cùng cặp nhìn từ phía ngược lại cho cùng kết quả', () => {
    expect(buildPairDetail(bills, [], 'An', 'Tôi', month)).toMatchObject({ label: 'Tôi nợ An', amount: 10, other: 'An' });
    expect(buildPairDetail([B2], [], 'Tôi', 'An', month)).toMatchObject({ label: 'An nợ tôi', tone: 'get', amount: 20 });
  });

  it('cặp không có tôi: nhãn "X nợ Y", mọi dòng trung tính, không gộp nợ', () => {
    const d = buildPairDetail(bills, [], 'An', 'Bình', month);
    expect(d).toMatchObject({ label: 'Bình nợ An', tone: 'mid', amount: 30, other: null, canMerge: false, mergeAmount: 0, monthMode: true });
    expect(d.days.flatMap((g) => g.rows.map((r) => r.tone))).toEqual(['mid']);
  });

  it('không có bill trong kỳ: trống, không thanh toán được; chênh lệch dưới 0,05 thì không có nút thanh toán', () => {
    expect(buildPairDetail(bills, [], 'Tôi', 'An', { mode: 'month', month: '2024-01' })).toMatchObject({ empty: true, amount: 0, canPay: false });
    const paid = buildPairDetail(bills, [pay('a', 'Tôi', 'An', 9.97, { kind: 'billpay' })], 'Tôi', 'An', { mode: 'all' });
    expect(paid.amount).toBeCloseTo(0.03, 6);
    expect(paid.canPay).toBe(false);
  });
});
