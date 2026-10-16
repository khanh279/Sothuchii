import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { billSettled, billTransferStatuses } from './billPayment';
import { personBillRows } from './billPerson';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-10', note: '', from, to, amt, kind: 'billpay', ...over });

// Tôi nợ An 30 (B1, 01/10) và 50 (B3, 05/10); An nợ tôi 20 (B2, 03/10).
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40), p('An', 0)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100)]);

describe('billTransferStatuses', () => {
  it('chưa trả gì: mọi khoản chuyển là "chưa thanh toán", đủ số tiền còn thiếu', () => {
    const map = billTransferStatuses([B1], []);
    expect(map.get('B1')).toEqual([{ from: 'Tôi', to: 'An', amount: 30, paid: 0, remaining: 30, state: 'unpaid' }]);
    expect(billSettled(map.get('B1'))).toBe(false);
  });

  it('trả đủ: "đã thanh toán"; trả một phần: "một phần" với số đã trả và còn thiếu', () => {
    const full = billTransferStatuses([B1], [pay('x', 'Tôi', 'An', 30)]).get('B1')!;
    expect(full[0]).toMatchObject({ paid: 30, remaining: 0, state: 'paid' });
    expect(billSettled(full)).toBe(true);
    const part = billTransferStatuses([B1], [pay('x', 'Tôi', 'An', 10)]).get('B1')!;
    expect(part[0]).toMatchObject({ paid: 10, remaining: 20, state: 'partial' });
    expect(billSettled(part)).toBe(false); // mới một phần thì bill vẫn chưa thanh toán xong
  });

  it('phân bổ theo thứ tự thời gian: khoản trả trừ vào bill cũ trước, rồi sang bill sau; trả dư không thuộc bill nào', () => {
    const map = billTransferStatuses([B1, B3], [pay('x', 'Tôi', 'An', 45)]);
    expect(map.get('B1')![0]).toMatchObject({ paid: 30, state: 'paid' });
    expect(map.get('B3')![0]).toMatchObject({ amount: 50, paid: 15, remaining: 35, state: 'partial' });
    const over = billTransferStatuses([B1], [pay('x', 'Tôi', 'An', 100)]).get('B1')!;
    expect(over[0]).toMatchObject({ paid: 30, remaining: 0, state: 'paid' });
  });

  it('khoản trả ngược chiều hoặc khác sổ (vay) không làm đổi trạng thái', () => {
    expect(billTransferStatuses([B1], [pay('x', 'An', 'Tôi', 30)]).get('B1')![0].state).toBe('unpaid');
    expect(billTransferStatuses([B1], [pay('x', 'Tôi', 'An', 30, { kind: 'vay' })]).get('B1')![0].state).toBe('unpaid');
  });

  it('khớp với phân bổ sẵn có cho cặp có "Tôi" (personBillRows), từng bill', () => {
    const pays = [pay('x', 'Tôi', 'An', 45), pay('y', 'An', 'Tôi', 5, { createdAt: 11 })];
    const map = billTransferStatuses([B1, B2, B3], pays);
    const rows = personBillRows([B1, B2, B3], pays, 'An', { mode: 'all' }).rows;
    for (const row of rows) {
      const status = map.get(row.id)!.find((t) => t.from === 'An' || t.to === 'An')!;
      expect({ id: row.id, paid: status.paid, remaining: status.remaining }).toEqual({ id: row.id, paid: row.paid, remaining: row.remaining });
    }
  });

  it('khoản chuyển giữa hai người không có "Tôi" cũng được phân bổ; bill không cần chuyển thì coi như đã thanh toán', () => {
    const others = bill('BX', '2025-10-02', 4, [p('Bình', 90), p('An', 0), p('Chi', 0)]);
    const unpaid = billTransferStatuses([others], []).get('BX')!;
    expect(unpaid).toHaveLength(2);
    const paidOne = billTransferStatuses([others], [pay('x', unpaid[0].from, unpaid[0].to, unpaid[0].amount)]).get('BX')!;
    expect(paidOne[0].state).toBe('paid');
    expect(paidOne[1].state).toBe('unpaid');
    const solo = bill('BS', '2025-10-02', 5, [p('Tôi', 50)]);
    expect(billSettled(billTransferStatuses([solo], []).get('BS'))).toBe(true);
  });

  it('chỉ đọc: không đổi dữ liệu truyền vào', () => {
    const pays = [pay('x', 'Tôi', 'An', 10)];
    const before = JSON.stringify([B1, pays]);
    billTransferStatuses([B1], pays);
    expect(JSON.stringify([B1, pays])).toBe(before);
  });
});
