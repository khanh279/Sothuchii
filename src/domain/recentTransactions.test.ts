import type { ExpenseWithId } from '@/types/expense';
import type { Pay } from '@/types/pay';

import { buildRecentTransactions } from './recentTransactions';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Khoản chi và khoản trả đều là ĐỒNG.
const exp = (id: string, d: string, t: number, a: number, over: Partial<ExpenseWithId> = {}): ExpenseWithId => ({ id, a, c: 'food', n: id, d, t, ...over });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, kind: 'vay', ...over });
const name = (id: string) => (id === 'food' ? 'Ăn uống' : 'Khác');
const run = (expenses: ExpenseWithId[], pays: Pay[], limit = 10) => buildRecentTransactions({ expenses, pays, categoryName: name, limit });

describe('buildRecentTransactions', () => {
  it('gộp khoản chi và khoản trả, mới nhất trước (cùng ngày thì tạo sau trước)', () => {
    const list = run(
      [exp('a', '2025-10-04', 1, 50_000), exp('b', '2025-10-05', 5, 20_000)],
      [pay('p1', 'Tôi', 'An', 100_000, { createdAt: 9 })],
    );
    expect(list.map((x) => x.key)).toEqual(['pay:p1', 'expense:2025-10/b', 'expense:2025-10/a']);
  });

  it('chiều tiền và đơn vị: chi = ra (đồng); tôi chuyển đi = ra, người khác chuyển cho tôi = vào', () => {
    const list = run([exp('a', '2025-10-04', 1, 50_000)], [pay('out', 'Tôi', 'An', 100_000), pay('in', 'Bình', 'Tôi', 30_000, { createdAt: 11 })]);
    const by = Object.fromEntries(list.map((x) => [x.key, x]));
    expect(by['expense:2025-10/a']).toMatchObject({ flow: 'out', amount: 50_000, typeLabel: 'Chi tiêu', title: 'a' });
    expect(by['pay:out']).toMatchObject({ flow: 'out', amount: 100_000, title: 'Chuyển cho An', typeLabel: 'Chuyển tiền' });
    expect(by['pay:in']).toMatchObject({ flow: 'in', amount: 30_000, title: 'Bình chuyển cho tôi' });
  });

  it('khoản trả sổ bill: nhãn "Trả bill"', () => {
    const [item] = run([], [pay('b', 'Tôi', 'An', 40_000, { kind: 'billpay' })]);
    expect(item).toMatchObject({ typeLabel: 'Trả bill', title: 'Trả bill cho An', flow: 'out', amount: 40_000 });
  });

  it('CHỐNG TRÙNG: khoản chi là "bóng" của khoản trả (pay.exp trỏ tới) thì bỏ, chỉ hiện dòng khoản trả', () => {
    const shadow = exp('s', '2025-10-05', 3, 30_000, { src: 'cb', i: 'Trả An · bill 01/10' });
    const mine = exp('m', '2025-10-05', 2, 15_000, { src: 'cb', i: 'Chia bill 05/10 · 2 người' });
    const list = run([shadow, mine], [pay('p', 'Tôi', 'An', 30_000, { kind: 'billpay', exp: [{ m: '2025-10', id: 's' }] })]);
    expect(list.map((x) => x.key).sort()).toEqual(['expense:2025-10/m', 'pay:p']);
    expect(list.find((x) => x.key === 'expense:2025-10/m')).toMatchObject({ typeLabel: 'Chia bill', subtitle: 'Chia bill 05/10 · 2 người' });
  });

  it('khoản chi từ quỹ (phần đóng của tôi) hiện là chi tiêu "Quỹ nhóm"; không đọc dữ liệu quỹ nên không trộn số dư quỹ', () => {
    const [item] = run([exp('q', '2025-10-05', 1, 100_000, { src: 'quy', c: 'fund', i: 'Quỹ lớp' })], []);
    expect(item).toMatchObject({ typeLabel: 'Quỹ nhóm', flow: 'out', subtitle: 'Quỹ lớp' });
  });

  it('không tính: gộp nợ (bt), khoản trả giữa hai người khác, số tiền ≤ 0', () => {
    const list = run([], [pay('m', 'An', 'Tôi', 10_000, { kind: 'bt', grp: 'g' }), pay('o', 'An', 'Bình', 50_000), pay('z', 'Tôi', 'An', 0)]);
    expect(list).toEqual([]);
  });

  it('giới hạn số dòng; limit 0 hoặc không có dữ liệu → rỗng; không sửa đầu vào', () => {
    const expenses = [exp('a', '2025-10-01', 1, 1000), exp('b', '2025-10-02', 2, 2000), exp('c', '2025-10-03', 3, 3000)];
    const copy = JSON.parse(JSON.stringify(expenses));
    expect(run(expenses, [], 2).map((x) => x.key)).toEqual(['expense:2025-10/c', 'expense:2025-10/b']);
    expect(run(expenses, [], 0)).toEqual([]);
    expect(run([], [])).toEqual([]);
    expect(expenses).toEqual(copy);
  });

  it('khoản chi không có nội dung dùng tên mục; thiếu mục thì dùng tên do hàm trả về', () => {
    const [item] = run([exp('a', '2025-10-01', 1, 1000, { n: '', c: 'zzz' })], []);
    expect(item).toMatchObject({ title: 'Khác', subtitle: 'Khác' });
  });
});
