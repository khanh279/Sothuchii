import { RECURRING_NOTE, dueDate, dueRecurring, markDone, normalizeRecurring, type RecurringExpense } from './recurring';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật. Tiền: ĐỒNG.
const rule = (over: Partial<RecurringExpense> = {}): RecurringExpense => ({ id: 'r1', a: 3_000_000, c: 'home', n: 'Tiền nhà', day: 5, from: '2025-08', ...over });

describe('dueDate', () => {
  it('ngày hạn lớn hơn số ngày của tháng thì lùi về ngày cuối tháng', () => {
    expect(dueDate('2025-02', 31)).toBe('2025-02-28');
    expect(dueDate('2024-02', 30)).toBe('2024-02-29');
    expect(dueDate('2025-10', 5)).toBe('2025-10-05');
  });
});

describe('dueRecurring', () => {
  it('ghi mọi tháng từ tháng bắt đầu đến tháng này khi ngày hạn không sau hôm nay', () => {
    const due = dueRecurring([rule()], '2025-10-10', 1);
    expect(due.map((item) => item.expense.d)).toEqual(['2025-08-05', '2025-09-05', '2025-10-05']);
    expect(due[0]).toMatchObject({ expenseId: 'rec-r1-2025-08', expense: { a: 3_000_000, c: 'home', n: 'Tiền nhà', i: RECURRING_NOTE } });
  });

  it('tháng này chưa đến ngày hạn thì chưa ghi; chỉ ghi sau tháng đã xử lý', () => {
    expect(dueRecurring([rule({ done: '2025-09' })], '2025-10-04', 1)).toEqual([]);
    expect(dueRecurring([rule({ done: '2025-09' })], '2025-10-05', 1).map((item) => item.month)).toEqual(['2025-10']);
  });

  it('tháng bắt đầu ở tương lai thì chưa ghi gì', () => {
    expect(dueRecurring([rule({ from: '2026-01' })], '2025-10-10', 1)).toEqual([]);
  });
});

describe('markDone', () => {
  it('đặt done là tháng lớn nhất đã xử lý; quy tắc không có khoản đến hạn giữ nguyên', () => {
    const rules = [rule(), rule({ id: 'r2', day: 28 })];
    const due = dueRecurring(rules, '2025-10-10', 1);
    const next = markDone(rules, due);
    expect(next[0].done).toBe('2025-10');
    expect(next[1].done).toBe('2025-09'); // ngày 28 tháng 10 chưa đến
    expect(dueRecurring(next, '2025-10-10', 1)).toEqual([]); // chạy lại không ghi thêm
  });
});

describe('normalizeRecurring', () => {
  it('bỏ mục sai dạng, giữ mục hợp lệ', () => {
    const list = normalizeRecurring([rule(), { ...rule({ id: 'x' }), a: 0 }, { ...rule({ id: 'y' }), day: 40 }, { ...rule({ id: 'z' }), from: 'abc' }, 'x', null]);
    expect(list).toEqual([rule()]);
    expect(normalizeRecurring('x')).toEqual([]);
  });
});
