import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { buildDebtOverview } from './debtOverview';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, ...over });

const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 90), p('Bình', 0)]); // Tôi nợ An 30, Bình nợ An 30
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40), p('Chi', 0)]); // Chi nợ tôi 20
const LOAN = pay('L', 'Tôi', 'An', 50, { kind: 'vay', date: '2025-10-02' }); // An nợ tôi 50 (vay)

describe('buildDebtOverview', () => {
  it('tổng Tôi nợ / Người khác nợ tôi và từng người ở hai sổ, lớn nhất trước', () => {
    const o = buildDebtOverview([B1, B2], [LOAN], { mode: 'all' });
    expect(o).toMatchObject({ owe: 30, get: 70, oweSigned: true, getSigned: true });
    expect(o.people).toEqual([
      { name: 'An', lines: [{ label: 'Vay', value: 50, tone: 'get' }, { label: 'Bill', value: -30, tone: 'owe' }] },
      { name: 'Chi', lines: [{ label: 'Bill', value: 20, tone: 'get' }] },
    ]);
  });

  it('chỉ liệt kê sổ còn nợ; người đã thanh toán xong ở cả hai sổ bị ẩn', () => {
    const settled = buildDebtOverview([B1], [pay('x', 'Tôi', 'An', 30, { kind: 'billpay' })], { mode: 'all' });
    expect(settled.people).toEqual([]);
    expect(settled.owe).toBe(0);
    expect(settled.oweSigned).toBe(false);
  });

  it('số dư là toàn thời gian; chỉ danh sách cặp theo kỳ', () => {
    const o = buildDebtOverview([B1, B2], [LOAN], { mode: 'month', month: '2025-09' });
    expect(o.people).toHaveLength(2);
    expect(o.owe).toBe(30);
    expect(o.pairs).toEqual([]);
    const oct = buildDebtOverview([B1, B2], [LOAN], { mode: 'month', month: '2025-10' });
    expect(oct.pairs.map((x) => [x.from, x.to, x.amt, x.tone])).toEqual([['Chi', 'Tôi', 20, 'get'], ['Tôi', 'An', 30, 'owe'], ['Bình', 'An', 30, 'mid']]);
  });

  it('cặp có tôi là người nhận lên trước, rồi tôi là người trả, rồi cặp khác', () => {
    const o = buildDebtOverview([B1, B2], [], { mode: 'all' });
    expect(o.pairs.map((x) => x.tone)).toEqual(['get', 'owe', 'mid']);
  });

  it('chưa có dữ liệu', () => {
    expect(buildDebtOverview([], [], { mode: 'all' })).toEqual({ owe: 0, get: 0, oweSigned: false, getSigned: false, people: [], pairs: [] });
  });

  it('không sửa đầu vào', () => {
    const copy = JSON.parse(JSON.stringify({ B1, B2, LOAN }));
    buildDebtOverview([B1, B2], [LOAN], { mode: 'all' });
    expect({ B1, B2, LOAN }).toEqual(copy);
  });
});
