import type { Bill } from '@/types/bill';
import type { ExpenseWithId } from '@/types/expense';
import type { Pay } from '@/types/pay';

import { buildPayHistory } from './payForm';
import { billOfExpense, buildTransactionEntries, expenseSourceLabel, filterTransactions, groupTransactionsByDay, isTransactionTab, sumTransactions, type TransactionFilter } from './transactionList';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Khoản chi và khoản trả đều là ĐỒNG.
const exp = (id: string, d: string, t: number, a: number, over: Partial<ExpenseWithId> = {}): ExpenseWithId => ({ id, a, c: 'food', n: id, d, t, ...over });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, kind: 'vay', ...over });
const PERIOD = { mode: 'month' as const, month: '2025-10' };

function build(expenses: ExpenseWithId[], pays: Pay[]) {
  const payRows = buildPayHistory(pays, [], PERIOD).days.flatMap((day) => day.rows);
  return buildTransactionEntries({ expenses, payRows, pays });
}
const keys = (expenses: ExpenseWithId[], pays: Pay[], tab: TransactionFilter) => filterTransactions(build(expenses, pays), tab).map((entry) => entry.key);

const shadow = exp('s', '2025-10-05', 3, 30_000, { src: 'cb', i: 'Trả An · bill 01/10' });
const share = exp('m', '2025-10-05', 2, 15_000, { src: 'cb', i: 'Chia bill 05/10 · 2 người' });
const fundShare = exp('q', '2025-10-04', 1, 20_000, { src: 'quy' });
const own = exp('o', '2025-10-04', 5, 50_000);
const billPay = pay('b', 'Tôi', 'An', 30_000, { kind: 'billpay', exp: [{ m: '2025-10', id: 's' }] });
const transfer = pay('t', 'Tôi', 'Bình', 100_000, { createdAt: 11 });
const incoming = pay('i', 'Bình', 'Tôi', 40_000, { createdAt: 12 });
const others = pay('x', 'An', 'Bình', 10_000, { kind: 'billpay', createdAt: 13 });
const gom = pay('g', 'Tôi', 'An', 5_000, { kind: 'bt' });

describe('buildTransactionEntries', () => {
  it('ngày giảm dần, cùng ngày thì tạo sau trước', () => {
    const list = build([own, share], [transfer, incoming]);
    expect(list.map((entry) => entry.key)).toEqual(['pay:i', 'pay:t', 'expense:2025-10/m', 'expense:2025-10/o']);
  });

  it('khoản chi là "bóng" của khoản trả được đánh dấu', () => {
    const list = build([shadow, share], [billPay]);
    const flags = Object.fromEntries(list.flatMap((entry) => (entry.kind === 'expense' ? [[entry.expense.id, entry.shadow]] : [])));
    expect(flags).toEqual({ s: true, m: false });
  });
});

describe('mục lọc', () => {
  const expenses = [own, share, shadow, fundShare];
  const pays = [billPay, transfer, incoming, others, gom];

  it('Tất cả: bỏ khoản chi bóng, bỏ gộp nợ, giữ khoản giữa hai người khác', () => {
    expect(keys(expenses, pays, 'all').sort()).toEqual(['expense:2025-10/m', 'expense:2025-10/o', 'expense:2025-10/q', 'pay:b', 'pay:i', 'pay:t', 'pay:x'].sort());
  });

  it('Chi tiêu: mọi khoản chi cá nhân (cả khoản từ quỹ, chia bill, khoản chi bóng), không có khoản trả', () => {
    expect(keys(expenses, pays, 'expense').sort()).toEqual(['expense:2025-10/m', 'expense:2025-10/o', 'expense:2025-10/q', 'expense:2025-10/s']);
  });

  it('Chuyển tiền: chỉ khoản trả không phải trả bill', () => {
    expect(keys(expenses, pays, 'loan').sort()).toEqual(['pay:i', 'pay:t']);
  });

  it('Bill: khoản trả bill và khoản chi từ chia bill (không kể khoản chi bóng)', () => {
    expect(keys(expenses, pays, 'bill').sort()).toEqual(['expense:2025-10/m', 'pay:b', 'pay:x']);
  });

  it('Chuyển tiền + bill: hợp của hai mục, không có chi tiêu thường', () => {
    expect(keys(expenses, pays, 'loanBill').sort()).toEqual(['expense:2025-10/m', 'pay:b', 'pay:i', 'pay:t', 'pay:x']);
  });
});

describe('billOfExpense', () => {
  const bill = { id: 'b1', title: 'Cà phê', date: '2025-10-05', createdAt: 1, cat: 'food', people: [], exp: { m: '2025-10', id: 'm' } } as Bill;
  it('tìm bill đã sinh khoản chi chia bill theo bill.exp', () => {
    expect(billOfExpense([bill], share)?.id).toBe('b1');
  });
  it('không có bill / không phải khoản chi cb thì null', () => {
    expect(billOfExpense([], share)).toBeNull();
    expect(billOfExpense([bill], own)).toBeNull();
    expect(billOfExpense([bill], { ...share, id: 'khac' })).toBeNull();
  });
});

describe('expenseSourceLabel', () => {
  it('nói rõ sửa ở đâu; khoản tự nhập không có nhãn', () => {
    expect(expenseSourceLabel(own, false, false)).toBeNull();
    expect(expenseSourceLabel(fundShare, false, false)).toBe('Sửa tại quỹ nhóm');
    expect(expenseSourceLabel(shadow, true, false)).toBe('Sửa tại khoản trả');
    expect(expenseSourceLabel(share, false, true)).toBe('Sửa theo bill');
    expect(expenseSourceLabel(share, false, false)).toBe('Sửa tại bill');
  });
});

describe('sumTransactions', () => {
  it('chi = ra; tôi trả = ra; nhận = vào; khoản giữa hai người khác không tính', () => {
    const entries = build([own], [transfer, incoming, others]);
    expect(sumTransactions(entries)).toEqual({ count: 4, out: 150_000, in: 40_000 });
  });
});

describe('groupTransactionsByDay', () => {
  it('gom các dòng liền nhau cùng ngày', () => {
    const days = groupTransactionsByDay(build([own, share], [transfer]));
    expect(days.map((day) => [day.date, day.entries.length])).toEqual([
      ['2025-10-05', 2],
      ['2025-10-04', 1],
    ]);
  });
});

describe('isTransactionTab', () => {
  it('chỉ nhận bốn mục', () => {
    expect(['all', 'expense', 'loan', 'bill'].every(isTransactionTab)).toBe(true);
    expect(isTransactionTab('fund')).toBe(false);
    expect(isTransactionTab(undefined)).toBe(false);
  });
});
