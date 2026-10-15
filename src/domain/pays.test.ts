import type { Pay } from '@/types/pay';

import { dedupePays, normalizePays, payDedupeKey, payExpenseRefs } from './pays';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const pay = (id: string, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 1, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 10, kind: 'vay', ...over });

describe('normalizePays', () => {
  it('bỏ mục không phải đối tượng; điền mặc định; đọc exp dạng mảng hoặc đơn lẻ', () => {
    const pays = normalizePays([
      { id: 'a', date: '2025-10-05', from: 'Tôi', to: 'An', amt: '12.5', kind: 'billpay', exp: [{ m: '2025-10', id: 'x' }, { m: '', id: 'bad' }, 'rác'] },
      { id: 7, exp: { m: '2025-09', id: 'y' } },
      null,
      'rác',
      [],
    ]);
    expect(pays).toHaveLength(2);
    expect(pays[0]).toEqual({ id: 'a', createdAt: 0, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 12.5, kind: 'billpay', exp: [{ m: '2025-10', id: 'x' }] });
    expect(pays[1]).toMatchObject({ id: '7', amt: 0, exp: [{ m: '2025-09', id: 'y' }] });
  });

  it('giữ các trường phân loại; BỎ QUA hoàn toàn nexp cũ', () => {
    const [p] = normalizePays([{ id: 'a', kind: 'bt', led: 'bill', grp: 'g1', bills: ['b1'], bill: 'b1', item: 'x', lbl: 'Thanh toán bill', ds: 1, nexp: [{ m: '2025-10', id: 'old' }] }]);
    expect(p).toMatchObject({ kind: 'bt', led: 'bill', grp: 'g1', bills: ['b1'], bill: 'b1', item: 'x', lbl: 'Thanh toán bill', ds: 1 });
    expect(p).not.toHaveProperty('nexp');
    expect(p.exp).toBeUndefined();
  });

  it('không phải mảng → rỗng; không sửa đầu vào', () => {
    expect(normalizePays(undefined)).toEqual([]);
    expect(normalizePays({})).toEqual([]);
    const raw = [{ id: 'a', amt: 1, exp: [{ m: '2025-10', id: 'x' }] }];
    const copy = JSON.parse(JSON.stringify(raw));
    normalizePays(raw);
    expect(raw).toEqual(copy);
  });

  it('payExpenseRefs gom mọi exp của các khoản trả', () => {
    const pays = [pay('a', { exp: [{ m: '2025-10', id: 'x' }, { m: '2025-10', id: 'y' }] }), pay('b'), pay('c', { exp: [{ m: '2025-09', id: 'z' }] })];
    expect(payExpenseRefs(pays)).toEqual([{ m: '2025-10', id: 'x' }, { m: '2025-10', id: 'y' }, { m: '2025-09', id: 'z' }]);
  });
});

describe('payDedupeKey', () => {
  it('cắt khoảng trắng ở người trả / nhận / ghi chú; "Đối soát" theo cờ ds hoặc ghi chú', () => {
    expect(payDedupeKey(pay('a', { from: ' Tôi ', to: 'An ', note: ' hi ' }))).toBe(payDedupeKey(pay('b', { from: 'Tôi', to: 'An', note: 'hi' })));
    expect(payDedupeKey(pay('a', { ds: 1 }))).not.toBe(payDedupeKey(pay('a')));
    expect(payDedupeKey(pay('a', { note: 'Đối soát' }))).toBe(payDedupeKey(pay('b', { note: 'Đối soát', ds: 1 })).replace('|0|', '|0|'));
  });

  it('khác ngày / loại / sổ / nhóm / bill thì khác khóa; khoản có bills lấy id làm khóa', () => {
    const base = pay('a');
    for (const other of [pay('b', { date: '2025-10-06' }), pay('b', { kind: 'billpay' }), pay('b', { led: 'bill' }), pay('b', { grp: 'g' }), pay('b', { bill: 'x' }), pay('b', { to: 'Bình' })]) {
      expect(payDedupeKey(other)).not.toBe(payDedupeKey(base));
    }
    expect(payDedupeKey(pay('a', { bills: ['b1'] }))).not.toBe(payDedupeKey(pay('b', { bills: ['b1'] })));
  });
});

describe('dedupePays (chỉ dùng khi lưu)', () => {
  it('khoản trùng khóa được gộp vào khoản đầu: CỘNG số tiền, làm tròn từng đồng; trả danh sách khoản bị gộp', () => {
    const list = [pay('a', { amt: 10.1 }), pay('b', { amt: 20.2 }), pay('c', { amt: 0.0004 }), pay('d', { to: 'Bình', amt: 5 })];
    const { pays, removed } = dedupePays(list);
    expect(pays.map((x) => [x.id, x.amt])).toEqual([['a', 30.3], ['d', 5]]);
    expect(removed.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('khoản thanh toán nhiều bill (có bills) không bao giờ bị gộp, dù giống hệt', () => {
    const list = [pay('a', { bills: ['x'], kind: 'repay' }), pay('b', { bills: ['x'], kind: 'repay' })];
    expect(dedupePays(list).pays).toHaveLength(2);
  });

  it('khoản đang SỬA (locked) không gộp theo cả hai chiều: tiền không bị cộng hai lần', () => {
    const edited = pay('e', { amt: 10 });
    const same = pay('o', { amt: 10 });
    const forward = dedupePays([same, edited], new Set(['e']));
    expect(forward.pays.map((x) => [x.id, x.amt])).toEqual([['o', 10], ['e', 10]]);
    expect(forward.removed).toEqual([]);
    const backward = dedupePays([edited, same], new Set(['e']));
    expect(backward.pays.map((x) => [x.id, x.amt])).toEqual([['e', 10], ['o', 10]]);
    // không khoá thì đúng hành vi PWA: gộp và cộng
    expect(dedupePays([same, edited]).pays.map((x) => x.amt)).toEqual([20]);
  });

  it('hai khoản mới trùng nhau trong cùng lần lưu vẫn được gộp; khoản locked không cản gộp các khoản khác', () => {
    const list = [pay('a'), pay('b'), pay('e')];
    const { pays } = dedupePays(list, new Set(['e']));
    expect(pays.map((x) => [x.id, x.amt])).toEqual([['a', 20], ['e', 10]]);
  });

  it('không sửa đầu vào, kể cả số tiền của khoản đầu', () => {
    const list = [pay('a'), pay('b')];
    const copy = JSON.parse(JSON.stringify(list));
    dedupePays(list);
    expect(list).toEqual(copy);
  });

  it('danh sách rỗng', () => {
    expect(dedupePays([])).toEqual({ pays: [], removed: [] });
  });
});
