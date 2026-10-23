import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { allocateBillPayments } from './billAllocation';
import { billTransferStatuses } from './billPayment';
import { personBillRows } from './billPerson';
import { allocatePayments } from './payExpenses';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({
  id,
  createdAt: 10,
  date: '2025-10-10',
  note: '',
  from,
  to,
  amt,
  kind: 'billpay',
  ...over,
});

// Tôi nợ An 30.000 (B1, 01/10) và 50.000 (B3, 05/10).
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60_000)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100_000)]);

describe('allocateBillPayments', () => {
  it('mỗi bill một danh sách khoản chuyển đúng thứ tự computeSplit, chưa trả thì còn nguyên', () => {
    const { byBill, byPay } = allocateBillPayments([B1, B3], []);
    expect(byBill.get('B1')!.map((s) => [s.from, s.to, s.amount, s.left])).toEqual([['Tôi', 'An', 30_000, 30_000]]);
    expect(byBill.get('B3')![0]).toMatchObject({ amount: 50_000, left: 50_000 });
    expect(byPay.size).toBe(0);
  });

  it('bill cũ trước: trả 45.000 hết B1 rồi một phần B3; ghi lại từng lần trừ; trả dư không thuộc bill nào', () => {
    const x = pay('x', 'Tôi', 'An', 45_000);
    const { byBill, byPay } = allocateBillPayments([B3, B1], [x]);
    expect(byBill.get('B1')![0].left).toBe(0);
    expect(byBill.get('B3')![0].left).toBe(35_000);
    expect(byPay.get(x)!.map((t) => [t.slot.bill.id, t.amount])).toEqual([
      ['B1', 30_000],
      ['B3', 15_000],
    ]);
    const over = pay('y', 'Tôi', 'An', 200_000);
    expect(
      allocateBillPayments([B1], [over])
        .byPay.get(over)!
        .map((t) => t.amount),
    ).toEqual([30_000]);
  });

  it('chỉ cùng cặp có chiều mới trừ: khoản ngược chiều, sổ vay, người khác không ảnh hưởng', () => {
    const pays = [pay('a', 'An', 'Tôi', 30_000), pay('b', 'Tôi', 'An', 30_000, { kind: 'vay' }), pay('c', 'Tôi', 'Bình', 30_000)];
    const { byBill, byPay } = allocateBillPayments([B1], pays);
    expect(byBill.get('B1')![0].left).toBe(30_000);
    expect(byPay.size).toBe(0);
  });

  it('khoản trả ghi trước ngày bill không trừ vào bill đó; gộp nợ sổ bill (bt, led bill) được tính', () => {
    expect(allocateBillPayments([B1], [pay('x', 'Tôi', 'An', 30_000, { date: '2025-09-01' })]).byBill.get('B1')![0].left).toBe(30_000);
    expect(allocateBillPayments([B1], [pay('m', 'Tôi', 'An', 10_000, { kind: 'bt', led: 'bill', grp: 'g' })]).byBill.get('B1')![0].left).toBe(20_000);
  });

  it('không sửa đầu vào', () => {
    const pays = [pay('x', 'Tôi', 'An', 45_000)];
    const copy = JSON.parse(JSON.stringify({ bills: [B1, B3], pays }));
    allocateBillPayments([B1, B3], pays);
    expect({ bills: [B1, B3], pays }).toEqual(copy);
  });
});

describe('ba cách nhìn cùng một phân bổ (chống lệch)', () => {
  let seed = 424242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const NAMES = ['Tôi', 'An', 'Bình', 'Chi'];

  it('trạng thái từng khoản chuyển = các dòng của personBillRows = số tiền sinh khoản chi của allocatePayments', () => {
    for (let it = 0; it < 400; it++) {
      const bills: Bill[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) =>
        bill(
          `b${i}`,
          `2025-10-0${1 + Math.floor(rnd() * 5)}`,
          Math.floor(rnd() * 4),
          [...NAMES]
            .sort(() => rnd() - 0.5)
            .slice(0, 2 + Math.floor(rnd() * 3))
            .map((n) => p(n, Math.floor(rnd() * 6) * 30_000 + (rnd() < 0.3 ? 1234 : 0))),
        ),
      );
      const pays: Pay[] = Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => {
        const from = pick(NAMES);
        return pay(`p${i}`, from, pick(NAMES.filter((n) => n !== from)), (1 + Math.floor(rnd() * 9)) * 7000 + (rnd() < 0.3 ? 333 : 0), {
          createdAt: Math.floor(rnd() * 6),
          date: `2025-10-0${1 + Math.floor(rnd() * 8)}`,
          kind: pick(['billpay', 'vay', 'bt']),
          led: 'bill',
        });
      });
      const statuses = billTransferStatuses(bills, pays);
      const expenses = Object.values(allocatePayments(bills, pays)).flat();
      for (const who of NAMES.filter((n) => n !== 'Tôi')) {
        const rows = personBillRows(bills, pays, who, { mode: 'all' }).rows;
        for (const row of rows) {
          const status = statuses.get(row.id)!.find((t) => (t.from === who && t.to === 'Tôi') || (t.from === 'Tôi' && t.to === who))!;
          expect(Math.abs(status.paid - row.paid) + Math.abs(status.remaining - row.remaining)).toBeLessThanOrEqual(100);
          if (row.dir === -1) {
            const spent = expenses.filter((e) => e.n === row.title && e.i.includes(` ${who} · `)).reduce((sum, e) => sum + e.a, 0);
            expect(spent).toBe(row.paid);
          }
        }
      }
    }
  });
});
