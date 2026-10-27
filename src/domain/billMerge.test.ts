import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { mergeBills } from './billMerge';
import { buildBillPairsFor } from './billPairs';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-10', note: '', from, to, amt, kind: 'billpay', ...over });

// Tôi nợ An 30 (B1) và 50 (B3); An nợ tôi 20 (B2); bill B4 không liên quan.
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60_000)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40_000), p('An', 0)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100_000)]);
const B4 = bill('B4', '2025-10-06', 4, [p('Bình', 90_000), p('Chi', 0), p('Dũng', 0)]);
const ALL = [B1, B2, B3, B4];

describe('mergeBills', () => {
  it('cộng đã chi, phần phải chịu và chênh lệch của từng người qua các bill', () => {
    const merged = mergeBills(ALL, ['B1', 'B2', 'B3']);
    expect(merged.total).toBe(200_000);
    expect(merged.from).toBe('2025-10-01');
    expect(merged.to).toBe('2025-10-05');
    expect(merged.bills.map((x) => x.id)).toEqual(['B1', 'B2', 'B3']);
    const by = Object.fromEntries(merged.people.map((x) => [x.name, x]));
    expect(by['Tôi']).toEqual({ name: 'Tôi', paid: 40_000, share: 100_000, net: -60_000 });
    expect(by['An']).toEqual({ name: 'An', paid: 160_000, share: 100_000, net: 60_000 });
  });

  it('người chỉ có mặt ở một bill vẫn được tính; tổng chênh lệch bằng 0', () => {
    const merged = mergeBills(ALL, ['B1', 'B4']);
    expect(merged.people.map((x) => x.name).sort()).toEqual(['An', 'Bình', 'Chi', 'Dũng', 'Tôi']);
    expect(merged.people.reduce((sum, x) => sum + x.net, 0)).toBe(0);
  });

  it('mã không tồn tại bị bỏ qua; thứ tự cũ → mới theo ngày', () => {
    const merged = mergeBills(ALL, ['B3', 'khong-co', 'B1']);
    expect(merged.bills.map((x) => x.id)).toEqual(['B1', 'B3']);
  });

  it('không chọn bill nào: rỗng', () => {
    expect(mergeBills(ALL, [])).toMatchObject({ bills: [], total: 0, people: [], hasBad: false });
  });
});

describe('buildBillPairsFor', () => {
  it('cộng và bù trừ các khoản chuyển chỉ của những bill được chọn, không theo kỳ', () => {
    const pairs = buildBillPairsFor(ALL, [], ['B1', 'B2', 'B3']);
    expect(pairs.map((x) => [x.from, x.to, x.remaining])).toEqual([['Tôi', 'An', 60_000]]);
    expect(pairs[0].billIds).toEqual(['B1', 'B2', 'B3']);
  });

  it('bill không được chọn không góp vào số còn lại', () => {
    expect(buildBillPairsFor(ALL, [], ['B1']).map((x) => [x.from, x.to, x.remaining])).toEqual([['Tôi', 'An', 30_000]]);
  });

  it('khoản trả thực tế đã được trừ (bill cũ trước, tính trên mọi bill)', () => {
    const pairs = buildBillPairsFor(ALL, [pay('P1', 'Tôi', 'An', 30_000)], ['B1', 'B2', 'B3']);
    expect(pairs.map((x) => [x.from, x.to, x.remaining, x.partial])).toEqual([['Tôi', 'An', 30_000, true]]);
  });

  it('thanh toán xong thì không còn cặp nào', () => {
    expect(buildBillPairsFor(ALL, [pay('P1', 'Tôi', 'An', 60_000)], ['B1', 'B2', 'B3'])).toEqual([]);
  });
});
