import type { Bill } from '@/types/bill';

import { computeSplit, desiredBillExpense } from './bills';
import { toSplitPeople } from './billForm';
import { billTotal, buildBillHistory, buildBillOverviewCard, formFromBill } from './billHistory';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const p = (name: string, paid: number, extra: { w?: number; fix?: number } = {}) => ({ name, paid, ...extra });
const bill = (id: string, date: string, createdAt: number, people = [p('Tôi', 100), p('B', 0)], over: Partial<Bill> = {}): Bill => ({
  id,
  title: id,
  date,
  createdAt,
  cat: 'food',
  people,
  ...over,
});

describe('buildBillHistory', () => {
  const bills = [
    bill('a', '2025-10-05', 1, [p('Tôi', 100), p('B', 0)]),
    bill('b', '2025-10-05', 2, [p('Tôi', 40), p('B', 10)]),
    bill('c', '2025-09-20', 3, [p('Tôi', 30), p('B', 0)]),
  ];

  it('gom theo ngày, ngày mới trước; cùng ngày thì bill tạo sau trước; tổng ngày và tổng kỳ', () => {
    const h = buildBillHistory(bills, { mode: 'all' });
    expect(h.days.map((d) => [d.date, d.bills.map((b) => b.id), d.total])).toEqual([
      ['2025-10-05', ['b', 'a'], 150],
      ['2025-09-20', ['c'], 30],
    ]);
    expect(h).toMatchObject({ count: 3, totalPaid: 180 });
  });

  it('lọc theo kỳ; kỳ không có bill thì rỗng', () => {
    expect(buildBillHistory(bills, { mode: 'month', month: '2025-10' })).toMatchObject({ count: 2, totalPaid: 150 });
    expect(buildBillHistory(bills, { mode: 'month', month: '2024-01' })).toEqual({ days: [], count: 0, totalPaid: 0 });
    expect(buildBillHistory(bills, { mode: 'custom', from: '2025-09-20', to: '2025-09-20' }).count).toBe(1);
  });

  it('không sửa đầu vào; tổng bill là tổng đã chi', () => {
    const copy = JSON.parse(JSON.stringify(bills));
    buildBillHistory(bills, { mode: 'all' });
    expect(bills).toEqual(copy);
    expect(billTotal(bills[1])).toBe(50);
  });
});

describe('formFromBill (sửa bill)', () => {
  it('"Không tên" thành ô trống; hệ số và mức cố định về đúng ô; số tiền giữ nguyên', () => {
    const state = formFromBill(bill('x', '2025-10-05', 1, [p('Tôi', 120, { w: 1.5 }), p('B', 0, { fix: 30 }), p('C', 0)], { title: 'Không tên', cat: '' }));
    expect(state.title).toBe('');
    expect(state.cat).toBe('other');
    expect(state.rows).toEqual([
      { name: 'Tôi', paidText: '120', weightText: '1,5', fixedText: '' },
      { name: 'B', paidText: '', weightText: '', fixedText: '30' },
      { name: 'C', paidText: '', weightText: '', fixedText: '' },
    ]);
  });

  it('"Tôi" ở chỗ khác được đưa lên đầu; thiếu "Tôi" thì thêm dòng hệ số 0', () => {
    const moved = formFromBill(bill('x', '2025-10-05', 1, [p('B', 0), p('Tôi', 90)]));
    expect(moved.rows.map((r) => r.name)).toEqual(['Tôi', 'B']);
    const missing = formFromBill(bill('x', '2025-10-05', 1, [p('A', 60), p('B', 0)]));
    expect(missing.rows[0]).toMatchObject({ name: 'Tôi', weightText: '0' });
    expect(missing.rows).toHaveLength(3);
  });

  it('sửa rồi tính lại cho ra đúng phép chia cũ (đi và về không đổi kết quả)', () => {
    const original = bill('x', '2025-10-05', 1, [p('Tôi', 120, { w: 2 }), p('B', 0, { fix: 30 }), p('C', 10)]);
    const again = toSplitPeople(formFromBill(original).rows);
    const a = computeSplit(original.people);
    const b = computeSplit(again);
    expect(b.rows.map((r) => [r.share, r.paid])).toEqual(a.rows.map((r) => [r.share, r.paid]));
    expect(desiredBillExpense({ ...original, people: again })).toEqual(desiredBillExpense(original));
  });
});

describe('buildBillOverviewCard', () => {
  const bills = [
    bill('a', '2025-10-05', 1, [p('Tôi', 100), p('An', 50), p('Bình', 0)]),
    bill('b', '2025-10-06', 2, [p('Chủ bill', 60), p('Tôi', 10), p('An', 0)]), // người đầu tính là "Tôi"
    bill('c', '2025-09-20', 3, [p('Tôi', 30), p('  ', 5)]),
  ];

  it('đếm bill và tổng bill trong kỳ; người chi gộp theo tên, xếp chi nhiều nhất trước', () => {
    const card = buildBillOverviewCard(bills, { mode: 'month', month: '2025-10' }, false);
    expect(card).toMatchObject({ count: 2, total: 220, hidden: 0, canCollapse: false });
    expect(card.rows.map((r) => [r.name, r.amount])).toEqual([['Tôi', 170], ['An', 50]]);
    expect(card.rows.map((r) => r.percent)).toEqual([100, 29.4]);
  });

  it('bỏ người không có tên hoặc chưa chi; kỳ trống cho khung rỗng', () => {
    const all = buildBillOverviewCard(bills, { mode: 'all' }, false);
    expect(all.rows.map((r) => r.name)).toEqual(['Tôi', 'An']);
    expect(buildBillOverviewCard(bills, { mode: 'month', month: '2024-01' }, false)).toEqual({ count: 0, total: 0, rows: [], hidden: 0, canCollapse: false });
  });

  it('thanh tối thiểu 2% để vẫn thấy được', () => {
    const big = [bill('x', '2025-10-05', 1, [p('Tôi', 100000), p('An', 1)])];
    expect(buildBillOverviewCard(big, { mode: 'all' }, false).rows.map((r) => r.percent)).toEqual([100, 2]);
  });

  it('quá 3 người: thu gọn còn 3 + "Xem thêm"; mở hết thì có "Thu gọn"; đúng 3 người thì không thu gọn', () => {
    const many = [bill('m', '2025-10-05', 1, [p('Tôi', 50), p('A', 40), p('B', 30), p('C', 20), p('D', 10)])];
    expect(buildBillOverviewCard(many, { mode: 'all' }, false)).toMatchObject({ hidden: 2, canCollapse: false });
    expect(buildBillOverviewCard(many, { mode: 'all' }, false).rows).toHaveLength(3);
    expect(buildBillOverviewCard(many, { mode: 'all' }, true)).toMatchObject({ hidden: 0, canCollapse: true });
    const three = [bill('t', '2025-10-05', 1, [p('Tôi', 50), p('A', 40), p('B', 30)])];
    expect(buildBillOverviewCard(three, { mode: 'all' }, false)).toMatchObject({ hidden: 0, canCollapse: false });
  });
});
