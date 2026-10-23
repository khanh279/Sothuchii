import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import {
  buildPayHistory,
  canRecordPay,
  formFromPay,
  formatPayAmount,
  maskPayAmount,
  parsePayAmount,
  payKindFor,
  payLabel,
  payNameOptions,
  payRowSubtitle,
  payTypeOf,
  whoOptions,
} from './payForm';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, title: string, date = '2025-10-01', people = [p('Tôi', 10_000), p('An', 0)]): Bill => ({ id, title, date, createdAt: 1, cat: 'food', people });
const pay = (id: string, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 1, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 10_000, kind: 'vay', ...over });

describe('lựa chọn người', () => {
  it('"Tôi" đứng đầu, rồi tên từ bill, khoản trả và Danh sách người; bỏ trùng, bỏ khoảng trắng, xếp theo chữ', () => {
    const bills = [bill('b', 'x', '2025-10-01', [p('Tôi', 1000), p('Bình ', 0), p('An', 0)])];
    const pays = [pay('a', { from: 'Chi', to: 'Tôi' }), pay('b', { from: ' An ', to: 'Dũng' })];
    expect(payNameOptions(bills, pays, ['Bình', 'Em', '', 'tôi'])).toEqual(['Tôi', 'An', 'Bình', 'Chi', 'Dũng', 'Em', 'tôi']);
    expect(payNameOptions([], [], [])).toEqual(['Tôi']);
  });

  it('ô "đến" bỏ người đã chọn ở ô "từ"', () => {
    expect(whoOptions(['Tôi', 'An', 'Bình'], 'An')).toEqual(['Tôi', 'Bình']);
    expect(whoOptions(['Tôi'], 'Tôi')).toEqual([]);
  });
});

describe('nhập liệu', () => {
  it('số tiền theo đồng: chỉ chữ số, tối đa 9 chữ số', () => {
    expect(maskPayAmount('1234567')).toBe('1234567');
    expect(maskPayAmount('1.234.567')).toBe('1234567');
    expect(maskPayAmount('12,3456')).toBe('123456');
    expect(maskPayAmount('1234567890')).toBe('123456789');
    expect(parsePayAmount('1.234.500')).toBe(1_234_500);
    expect(parsePayAmount('')).toBe(0);
    expect(parsePayAmount('abc')).toBe(0);
  });

  it('đi và về giữa số và chữ', () => {
    for (const amount of [5000, 12_500, 1_234_567, 100_000]) expect(parsePayAmount(formatPayAmount(amount))).toBe(amount);
    expect(formatPayAmount(12_500)).toBe('12500');
  });

  it('ghi nhận chỉ khi đã chọn người nhận và số tiền > 0', () => {
    expect(canRecordPay('An', 1000)).toBe(true);
    expect(canRecordPay('', 1)).toBe(false);
    expect(canRecordPay('An', 0)).toBe(false);
    expect(canRecordPay('An', -3000)).toBe(false);
  });

  it('loại: trả bill ↔ billpay, chuyển tiền ↔ vay; khoản đã lưu được phân loại theo sổ', () => {
    expect(payKindFor('bill')).toBe('billpay');
    expect(payKindFor('vay')).toBe('vay');
    expect(payTypeOf({ kind: 'billpay' })).toBe('bill');
    expect(payTypeOf({ kind: 'repay' })).toBe('bill');
    expect(payTypeOf({ kind: 'xfer' })).toBe('vay');
    expect(payTypeOf({ item: 'x' })).toBe('vay');
    expect(payTypeOf({})).toBe('bill');
  });

  it('dựng form từ khoản đã lưu', () => {
    expect(formFromPay(pay('a', { amt: 12_500, note: 'ăn', kind: 'billpay' }))).toEqual({ date: '2025-10-05', note: 'ăn', from: 'Tôi', to: 'An', amountText: '12500', type: 'bill' });
  });
});

describe('nhãn', () => {
  const bills = [bill('b1', 'Ăn trưa', '2025-10-03'), bill('b2', '')];

  it('chuyển tiền, trả bill (kèm tên bill và ngày), gộp nợ, nhãn riêng', () => {
    expect(payLabel(pay('a'), bills)).toEqual(['Chuyển tiền', '']);
    expect(payLabel(pay('a', { kind: 'billpay' }), bills)).toEqual(['Trả bill', '']);
    expect(payLabel(pay('a', { kind: 'bill', bill: 'b1' }), bills)).toEqual(['Trả bill', 'Ăn trưa (03/10)']);
    expect(payLabel(pay('a', { kind: 'bill', bill: 'b2' }), bills)).toEqual(['Trả bill', 'Không tên (01/10)']);
    expect(payLabel(pay('a', { kind: 'bt' }), bills)).toEqual(['Gộp nợ', '']);
    expect(payLabel(pay('a', { lbl: 'Thanh toán bill', bills: ['b1', 'xx', 'b2'] }), bills)).toEqual(['Thanh toán bill', 'Ăn trưa, bill đã xoá, Không tên']);
  });
});

describe('buildPayHistory', () => {
  const bills = [bill('b1', 'Ăn'), bill('b2', 'Phim')];

  it('bỏ gộp nợ, mới nhất trước, gom theo ngày; tổng vào / ra không tính gộp nợ', () => {
    const pays = [
      pay('a', { date: '2025-10-05', createdAt: 1, amt: 10_000 }),
      pay('b', { date: '2025-10-05', createdAt: 2, from: 'An', to: 'Tôi', amt: 4000 }),
      pay('c', { date: '2025-10-06', kind: 'bt', amt: 99_000 }),
      pay('d', { date: '2025-09-01', amt: 7000 }),
    ];
    const h = buildPayHistory(pays, bills, { mode: 'all' });
    expect(h.days.map((d) => [d.date, d.rows.map((r) => r.id)])).toEqual([['2025-10-05', ['b', 'a']], ['2025-09-01', ['d']]]);
    expect(h).toMatchObject({ count: 3, totalIn: 4000, totalOut: 17_000 });
    expect(h.days[0].rows.map((r) => r.tone)).toEqual(['get', 'owe']);
  });

  it('lọc theo kỳ', () => {
    const pays = [pay('a', { date: '2025-10-05' }), pay('b', { date: '2025-09-01' })];
    expect(buildPayHistory(pays, bills, { mode: 'month', month: '2025-10' }).days.map((d) => d.date)).toEqual(['2025-10-05']);
    expect(buildPayHistory(pays, bills, { mode: 'month', month: '2024-01' })).toEqual({ days: [], count: 0, totalIn: 0, totalOut: 0 });
  });

  it('khoản trả bill giữa hai người khác "Tôi" cùng cặp trong ngày gom thành một dòng, cộng tiền, gộp tên bill; nhóm một khoản hiện như khoản đơn', () => {
    const pays = [
      pay('g1', { from: 'An', to: 'Bình', amt: 10_000, kind: 'billpay', bill: 'b1', createdAt: 1 }),
      pay('g2', { from: 'An', to: 'Bình', amt: 5500, kind: 'billpay', bill: 'b2', createdAt: 2 }),
      pay('s', { from: 'Chi', to: 'Bình', amt: 3000, kind: 'billpay', bill: 'b1', createdAt: 3 }),
      pay('x', { from: 'Tôi', to: 'An', amt: 1000, kind: 'billpay', createdAt: 4 }),
    ];
    const rows = buildPayHistory(pays, bills, { mode: 'all' }).days[0].rows;
    expect(rows.map((r) => [r.ids, r.amt, r.group])).toEqual([[['x'], 1000, false], [['s'], 3000, false], [['g2', 'g1'], 15_500, true]]);
    const group = rows[2];
    expect(group.title).toBe('Thanh toán bill');
    expect(group.detail).toBe('Ăn, Phim'); // thứ tự đảo như PWA (bản ghi mới trước → đảo lại)
    expect(group.tone).toBe('mid');
    expect(rows[1].title).toBe('Trả bill');
  });

  it('khoản có "Tôi" không bao giờ gom nhóm, dù cùng cặp và cùng ngày', () => {
    const pays = [pay('a', { kind: 'billpay', createdAt: 1 }), pay('b', { kind: 'billpay', createdAt: 2 })];
    expect(buildPayHistory(pays, bills, { mode: 'all' }).days[0].rows).toHaveLength(2);
  });

  it('dòng phụ (dưới nhãn loại): chi tiết bill + ghi chú; bỏ ghi chú "Đối soát" và "Trả nợ"', () => {
    const rows = buildPayHistory([pay('a', { note: 'tiền ăn' }), pay('b', { note: 'Đối soát', date: '2025-10-04' }), pay('c', { note: 'Trả nợ', date: '2025-10-03' })], bills, { mode: 'all' })
      .days.flatMap((d) => d.rows);
    expect(rows.map((r) => payRowSubtitle(r))).toEqual(['tiền ăn', '', '']);
  });

  it('không sửa đầu vào', () => {
    const pays = [pay('a'), pay('b', { from: 'An', to: 'Bình', kind: 'billpay' })];
    const copy = JSON.parse(JSON.stringify(pays));
    buildPayHistory(pays, bills, { mode: 'all' });
    expect(pays).toEqual(copy);
  });
});
