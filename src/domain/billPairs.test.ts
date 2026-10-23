import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';

import { billPairKey, buildBillPairs, filterBillsByPair, findBillPair } from './billPairs';
import { personBillRows } from './billPerson';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-10', note: '', from, to, amt, kind: 'billpay', ...over });

const OCT: Period = { mode: 'month', month: '2025-10' } as Period;
const NOV: Period = { mode: 'month', month: '2025-11' } as Period;

// Tôi nợ An 30 (B1) và 50 (B3); An nợ tôi 20 (B2); Chi và Dũng mỗi người nợ Bình 30 (B4).
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 60_000)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40_000), p('An', 0)]);
const B3 = bill('B3', '2025-10-05', 3, [p('Tôi', 0), p('An', 100_000)]);
const B4 = bill('B4', '2025-10-06', 4, [p('Bình', 90_000), p('Chi', 0), p('Dũng', 0)]);
const OUT = bill('B5', '2025-11-02', 5, [p('Tôi', 0), p('An', 40_000)]);
const ALL = [B1, B2, B3, B4, OUT];

describe('buildBillPairs', () => {
  it('liệt kê các cặp còn nợ trong kỳ, bù trừ hai chiều, nhiều tiền nhất trước', () => {
    const pairs = buildBillPairs(ALL, [], OCT);
    expect(pairs.map((x) => [x.from, x.to, x.remaining])).toEqual([
      ['Tôi', 'An', 60_000], // 30 + 50 − 20
      ['Chi', 'Bình', 30_000],
      ['Dũng', 'Bình', 30_000],
    ]);
    expect(pairs[0].billIds).toEqual(['B1', 'B2', 'B3']);
    expect(pairs[0].partial).toBe(false);
  });

  it('bill ngoài kỳ không thuộc phạm vi', () => {
    expect(buildBillPairs(ALL, [], NOV).map((x) => [x.from, x.to, x.remaining])).toEqual([['Tôi', 'An', 20_000]]);
    expect(buildBillPairs(ALL, [], OCT).every((x) => !x.billIds.includes('B5'))).toBe(true);
  });

  it('thanh toán một phần giảm số còn lại và đánh dấu một phần; trả hết thì cặp biến mất', () => {
    const part = buildBillPairs(ALL, [pay('x', 'Tôi', 'An', 20_000)], OCT).find((x) => x.key === billPairKey('Tôi', 'An'))!;
    expect(part).toMatchObject({ from: 'Tôi', to: 'An', remaining: 40_000, partial: true });
    const full = buildBillPairs(ALL, [pay('x', 'Tôi', 'An', 60_000)], OCT);
    expect(full.some((x) => x.key === billPairKey('Tôi', 'An'))).toBe(false);
  });

  it('khoản trả ghi ở ngày ngoài kỳ vẫn tính vào bill trong kỳ; khoản trả của cặp khác không ảnh hưởng', () => {
    const late = pay('x', 'Tôi', 'An', 20_000, { date: '2025-12-01' });
    const other = pay('y', 'Chi', 'Bình', 30_000);
    const pairs = buildBillPairs(ALL, [late, other], OCT);
    expect(pairs.find((x) => x.key === billPairKey('Tôi', 'An'))!.remaining).toBe(40_000);
    expect(pairs.some((x) => x.key === billPairKey('Chi', 'Bình'))).toBe(false);
    expect(pairs.find((x) => x.key === billPairKey('Dũng', 'Bình'))!.remaining).toBe(30_000);
  });

  it('cặp có "Tôi" khớp số còn phải thanh toán của personBillRows (cùng quy tắc phân bổ)', () => {
    const pays = [pay('x', 'Tôi', 'An', 45_000)];
    const pair = buildBillPairs(ALL, pays, OCT).find((x) => x.key === billPairKey('Tôi', 'An'))!;
    const person = personBillRows(ALL, pays, 'An', OCT);
    expect(pair.remaining).toBe(person.remaining);
    expect([pair.from, pair.to]).toEqual([person.from, person.to]);
  });
});

describe('findBillPair / filterBillsByPair', () => {
  const pairs = buildBillPairs(ALL, [], OCT);
  it('tìm theo khoá; khoá không còn hoặc null thì không có cặp', () => {
    expect(findBillPair(pairs, billPairKey('An', 'Tôi'))?.from).toBe('Tôi');
    expect(findBillPair(pairs, 'khong-co')).toBeNull();
    expect(findBillPair(pairs, null)).toBeNull();
  });

  it('lọc lịch sử đúng bill của cặp; không chọn thì giữ nguyên toàn bộ', () => {
    expect(filterBillsByPair(ALL, findBillPair(pairs, billPairKey('Tôi', 'An'))).map((b) => b.id)).toEqual(['B1', 'B2', 'B3']);
    expect(filterBillsByPair(ALL, findBillPair(pairs, billPairKey('Chi', 'Bình'))).map((b) => b.id)).toEqual(['B4']);
    expect(filterBillsByPair(ALL, null)).toHaveLength(ALL.length);
  });
});
