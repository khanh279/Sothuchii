import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import { buildDebtOverview, buildLoanPeople } from './debtOverview';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[]): Bill => ({ id, title: id, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, ...over });

const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 90_000), p('Bình', 0)]); // Tôi nợ An 30, Bình nợ An 30
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40_000), p('Chi', 0)]); // Chi nợ tôi 20
const LOAN = pay('L', 'Tôi', 'An', 50_000, { kind: 'vay', date: '2025-10-02' }); // An nợ tôi 50 (vay)

describe('buildDebtOverview', () => {
  it('mỗi người một tổng đại số vay + bill; tổng đầu khung tính từ tổng ròng', () => {
    const o = buildDebtOverview([B1, B2], [LOAN], { mode: 'all' });
    // An: vay +50, bill −30 → +20; Chi: bill +20
    expect(o).toMatchObject({ owe: 0, get: 40_000, oweSigned: false, getSigned: true });
    expect(o.people).toEqual([
      { name: 'An', total: 20_000, tone: 'get' },
      { name: 'Chi', total: 20_000, tone: 'get' },
    ]);
  });

  it('ví dụ yêu cầu: vay +700 và bill −200 hiển thị +500 màu xanh', () => {
    const o = buildDebtOverview([bill('B', '2025-10-01', 1, [p('Tôi', 0), p('An', 400_000)])], [pay('L', 'Tôi', 'An', 700_000, { kind: 'vay' })], { mode: 'all' });
    expect(o.people).toEqual([{ name: 'An', total: 500_000, tone: 'get' }]);
    expect(o.get).toBe(500_000);
    expect(o.owe).toBe(0);
  });

  it('hai sổ cùng chiều cộng dồn; tổng âm là "tôi nợ" (đỏ)', () => {
    const o = buildDebtOverview([B1], [pay('L', 'An', 'Tôi', 100_000, { kind: 'vay' })], { mode: 'all' });
    expect(o.people).toEqual([{ name: 'An', total: -130_000, tone: 'owe' }]);
    expect(o.owe).toBe(130_000);
    expect(o.oweSigned).toBe(true);
  });

  it('hai sổ trái dấu bù nhau về 0 vẫn được liệt kê (trung tính) và không vào tổng đầu khung', () => {
    const o = buildDebtOverview([B1], [pay('L', 'Tôi', 'An', 30_000, { kind: 'vay' })], { mode: 'all' });
    expect(o.people).toEqual([{ name: 'An', total: 0, tone: 'mid' }]);
    expect(o.get).toBe(0);
    expect(o.owe).toBe(0);
  });

  it('một sổ về 0, sổ còn lại khác 0 → tổng bằng sổ còn lại', () => {
    const o = buildDebtOverview([B1], [], { mode: 'all' });
    expect(o.people).toEqual([{ name: 'An', total: -30_000, tone: 'owe' }]);
  });

  it('người đã thanh toán xong ở cả hai sổ bị ẩn', () => {
    const settled = buildDebtOverview([B1], [pay('x', 'Tôi', 'An', 30_000, { kind: 'billpay' })], { mode: 'all' });
    expect(settled.people).toEqual([]);
    expect(settled.owe).toBe(0);
    expect(settled.oweSigned).toBe(false);
  });

  it('sắp theo độ lớn của tổng ròng, lớn nhất trước', () => {
    const o = buildDebtOverview([B2], [pay('L', 'Tôi', 'An', 50_000, { kind: 'vay' })], { mode: 'all' });
    expect(o.people.map((x) => [x.name, x.total])).toEqual([['An', 50_000], ['Chi', 20_000]]);
  });

  it('số dư là toàn thời gian; chỉ danh sách cặp theo kỳ', () => {
    const o = buildDebtOverview([B1, B2], [LOAN], { mode: 'month', month: '2025-09' });
    expect(o.people).toHaveLength(2);
    expect(o.get).toBe(40_000);
    expect(o.pairs).toEqual([]);
    const oct = buildDebtOverview([B1, B2], [LOAN], { mode: 'month', month: '2025-10' });
    expect(oct.pairs.map((x) => [x.from, x.to, x.amt, x.tone])).toEqual([['Chi', 'Tôi', 20_000, 'get'], ['Tôi', 'An', 30_000, 'owe'], ['Bình', 'An', 30_000, 'mid']]);
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

describe('buildLoanPeople — nợ vay theo người, toàn thời gian', () => {
  it('chỉ tính sổ vay (bỏ nợ bill); dương = họ nợ tôi, âm = tôi nợ họ; lớn nhất trước', () => {
    const people = buildLoanPeople([B1, B2], [LOAN, pay('L2', 'Bình', 'Tôi', 70_000, { kind: 'vay' })]);
    // An: vay +50 (bill −30 không tính); Bình: vay −70
    expect(people).toEqual([
      { name: 'Bình', total: -70_000, tone: 'owe' },
      { name: 'An', total: 50_000, tone: 'get' },
    ]);
  });

  it('người chỉ có nợ bill (không có vay) không xuất hiện; vay về 0 cũng bị bỏ', () => {
    expect(buildLoanPeople([B1, B2], [])).toEqual([]);
    expect(buildLoanPeople([], [pay('L', 'Tôi', 'An', 30_000, { kind: 'vay' }), pay('R', 'An', 'Tôi', 30_000, { kind: 'vay' })])).toEqual([]);
  });
});
