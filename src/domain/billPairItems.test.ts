import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';

import { buildBillPairItems, buildBillPairs } from './billPairs';

// DỮ LIỆU MẪU tự tạo, không phải dữ liệu thật. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: `Bill ${id}`, date, createdAt, cat: 'food', people });
const OCT: Period = { mode: 'month', month: '2025-10' } as Period;

// Tôi nợ An 30 (B1) và 50 (B3); An nợ tôi 20 (B2).
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60_000)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40_000), p('An', 0)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100_000)]);

describe('buildBillPairItems', () => {
  const bills = [B1, B2, B3];
  const pair = buildBillPairs(bills, [], OCT)[0];

  it('liệt kê từng khoản Tôi phải trả An theo bill, mới nhất trước, kèm khoản bù trừ chiều ngược lại', () => {
    expect(pair.from).toBe('Tôi');
    const items = buildBillPairItems(bills, [], pair);
    expect(items.map((i) => [i.billId, i.amount, i.offset])).toEqual([
      ['B3', 50_000, false],
      ['B2', 20_000, true],
      ['B1', 30_000, false],
    ]);
  });

  it('tổng các khoản cùng chiều trừ khoản bù trừ bằng số còn phải trả của cặp (khi chưa thanh toán)', () => {
    const items = buildBillPairItems(bills, [], pair);
    const net = items.reduce((sum, i) => sum + (i.offset ? -i.amount : i.amount), 0);
    expect(net).toBe(pair.remaining);
  });

  it('bill không thuộc phạm vi cặp thì bỏ qua', () => {
    expect(buildBillPairItems(bills, [], { from: 'Tôi', to: 'An', billIds: ['B1'] }).map((i) => i.billId)).toEqual(['B1']);
    expect(buildBillPairItems(bills, [], { from: 'Tôi', to: 'An', billIds: ['khong-co'] })).toEqual([]);
  });
});
