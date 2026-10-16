import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { checkPairPayment, pairAmountDraft, personBillRows, personBillSummary } from './billPerson';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[], title = id): Bill => ({ id, title, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-10', note: '', from, to, amt, kind: 'billpay', ...over });
const OCT = { mode: 'month' as const, month: '2025-10' };
const SEP = { mode: 'month' as const, month: '2025-09' };

// Tôi nợ An 30 (B1, 01/10) và 50 (B3, 05/10); An nợ tôi 20 (B2, 03/10); tháng 9: tôi nợ An 40 (B0).
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40), p('An', 0)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100)]);
const B0 = bill('B0', '2025-09-20', 0, [p('Tôi', 0), p('An', 80)]);
const OTHERS = bill('BX', '2025-10-02', 4, [p('Bình', 90), p('An', 0), p('Chi', 0)]); // không có tôi

describe('personBillSummary (cấp 1)', () => {
  it('mỗi người một số tiền còn phải thanh toán của bill trong kỳ; bill ngoài kỳ và bill không có tôi không tính', () => {
    expect(personBillSummary([B1, B2, B3, B0, OTHERS], [], OCT)).toEqual([{ name: 'An', amount: -60, tone: 'owe' }]); // −30 + 20 − 50
    expect(personBillSummary([B1, B2, B3, B0, OTHERS], [], SEP)).toEqual([{ name: 'An', amount: -40, tone: 'owe' }]);
  });

  it('họ nợ tôi: số dương, màu get; nhiều người xếp theo độ lớn', () => {
    const withChi = bill('BC', '2025-10-04', 5, [p('Tôi', 100), p('Chi', 0)]); // Chi nợ tôi 50
    expect(personBillSummary([B2, withChi], [], OCT)).toEqual([
      { name: 'Chi', amount: 50, tone: 'get' },
      { name: 'An', amount: 20, tone: 'get' },
    ]);
  });

  it('thanh toán đủ thì người đó biến mất; ngày ghi khoản trả không ảnh hưởng (kể cả sau kỳ)', () => {
    expect(personBillSummary([B1], [pay('x', 'Tôi', 'An', 30)], OCT)).toEqual([]);
    expect(personBillSummary([B1], [pay('x', 'Tôi', 'An', 30, { date: '2025-11-02' })], OCT)).toEqual([]);
    expect(personBillSummary([B1], [pay('x', 'Tôi', 'An', 10)], OCT)).toEqual([{ name: 'An', amount: -20, tone: 'owe' }]);
  });

  it('không có bill: trống', () => {
    expect(personBillSummary([], [], OCT)).toEqual([]);
  });
});

describe('personBillRows (cấp 2)', () => {
  it('liệt kê bill của người đó cũ → mới, mỗi bill có số tiền, đã trả, còn lại; tổng khớp cấp 1', () => {
    const r = personBillRows([B3, B2, B1, B0, OTHERS], [], 'An', OCT);
    expect(r.rows.map((x) => [x.id, x.amount, x.paid, x.remaining])).toEqual([
      ['B1', -30, 0, 30],
      ['B2', 20, 0, 20],
      ['B3', -50, 0, 50],
    ]);
    expect(r).toMatchObject({ net: -60, remaining: 60, from: 'Tôi', to: 'An' });
    expect(personBillSummary([B1, B2, B3], [], OCT)[0].amount).toBe(r.net);
  });

  it('thanh toán phân bổ từ bill cũ đến mới: đủ bill đầu, một phần bill kế; bill ngược chiều không bị trừ', () => {
    const r = personBillRows([B1, B2, B3], [pay('x', 'Tôi', 'An', 40)], 'An', OCT);
    expect(r.rows.map((x) => [x.id, x.paid, x.remaining])).toEqual([
      ['B1', 30, 0],
      ['B2', 0, 20],
      ['B3', 10, 40],
    ]);
    expect(r).toMatchObject({ net: -20, remaining: 20 });
  });

  it('nhiều lần thanh toán cộng dồn; khoản trả cho người khác không tính', () => {
    const pays = [pay('a', 'Tôi', 'An', 10), pay('b', 'Tôi', 'An', 15, { createdAt: 11 }), pay('d', 'Tôi', 'Bình', 99)];
    const r = personBillRows([B1, B3], pays, 'An', OCT);
    expect(r.rows.map((x) => [x.id, x.paid, x.remaining])).toEqual([['B1', 25, 5], ['B3', 0, 50]]);
  });

  it('phân bổ theo quy tắc sẵn có: khoản trả trừ vào bill CŨ nhất của người đó, kể cả bill ngoài kỳ đang xem', () => {
    const r = personBillRows([B0, B1], [pay('x', 'Tôi', 'An', 40)], 'An', OCT);
    expect(r.rows.map((x) => [x.id, x.paid, x.remaining])).toEqual([['B1', 0, 30]]); // 40 trừ hết vào B0 (tháng 9, nợ 40)
    expect(personBillRows([B0, B1], [pay('x', 'Tôi', 'An', 40)], 'An', SEP).rows[0]).toMatchObject({ id: 'B0', paid: 40, remaining: 0 });
  });

  it('khoản trả ghi TRƯỚC ngày bill không trừ vào bill đó; trả dư không thuộc bill nào', () => {
    expect(personBillRows([B1], [pay('x', 'Tôi', 'An', 30, { date: '2025-09-01' })], 'An', OCT).rows[0]).toMatchObject({ paid: 0, remaining: 30 });
    expect(personBillRows([B1], [pay('x', 'Tôi', 'An', 100)], 'An', OCT).rows[0]).toMatchObject({ paid: 30, remaining: 0 });
  });

  it('họ nợ tôi: họ trả tôi, chiều đảo lại', () => {
    const r = personBillRows([B2], [pay('x', 'An', 'Tôi', 5)], 'An', OCT);
    expect(r).toMatchObject({ net: 15, remaining: 15, from: 'An', to: 'Tôi' });
    expect(r.rows[0]).toMatchObject({ id: 'B2', amount: 20, paid: 5, remaining: 15, dir: 1 });
  });

  it('bill trùng tên và số tiền vẫn là hai dòng riêng, phân biệt bằng mã', () => {
    const a = bill('T1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60)], 'Ăn trưa');
    const b = bill('T2', '2025-10-01', 2, [p('Tôi', 0), p('An', 60)], 'Ăn trưa');
    expect(personBillRows([b, a], [], 'An', OCT).rows.map((x) => x.id)).toEqual(['T1', 'T2']);
  });

  it('không có bill: trống; không sửa đầu vào', () => {
    expect(personBillRows([], [], 'An', OCT)).toMatchObject({ rows: [], remaining: 0 });
    const copy = JSON.parse(JSON.stringify([B1, B2]));
    personBillRows([B1, B2], [pay('x', 'Tôi', 'An', 5)], 'An', OCT);
    expect([B1, B2]).toEqual(copy);
  });
});

describe('checkPairPayment / pairAmountDraft', () => {
  it('số tiền phải lớn hơn 0 và không vượt số còn phải thanh toán', () => {
    expect(checkPairPayment(60, 0)).toEqual({ ok: false, message: 'Nhập số tiền lớn hơn 0.' });
    expect(checkPairPayment(60, -5)).toMatchObject({ ok: false });
    expect(checkPairPayment(60, Number.NaN)).toMatchObject({ ok: false });
    expect(checkPairPayment(60, 60.5)).toEqual({ ok: false, message: 'Số tiền vượt quá số còn phải thanh toán (60.000 ₫).' });
    expect(checkPairPayment(60, 60)).toEqual({ ok: true, amount: 60 });
    expect(checkPairPayment(60, 25.0004)).toEqual({ ok: true, amount: 25 });
  });

  it('hết nợ thì không thanh toán được', () => {
    expect(checkPairPayment(0, 10)).toMatchObject({ ok: false });
  });

  it('bản nháp: từ người trả sang người nhận, sổ bill, đúng số tiền; không hợp lệ thì null', () => {
    const net = { from: 'Tôi', to: 'An', remaining: 60 };
    expect(pairAmountDraft(net, 25)).toEqual({ kind: 'billpay', from: 'Tôi', to: 'An', amt: 25 });
    expect(pairAmountDraft(net, 100)).toBeNull();
    expect(pairAmountDraft(net, 0)).toBeNull();
  });
});
