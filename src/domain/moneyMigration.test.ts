import { billsNghinToVnd, nghinToVnd, paysNghinToVnd } from './moneyMigration';

describe('chuyển nghìn đồng -> đồng', () => {
  it('nghinToVnd nhân 1000 và làm tròn; giá trị không hợp lệ là 0', () => {
    expect(nghinToVnd(100)).toBe(100_000);
    expect(nghinToVnd(33.333)).toBe(33_333);
    expect(nghinToVnd(0.5)).toBe(500);
    expect(nghinToVnd('12')).toBe(12_000);
    expect(nghinToVnd(NaN)).toBe(0);
    expect(nghinToVnd(undefined)).toBe(0);
  });

  it('bill: đổi paid và fix của từng người, giữ nguyên w, tên và trường lạ', () => {
    const raw = [
      {
        id: 'b1',
        title: 'Ăn',
        extra: 1,
        people: [
          { name: 'Tôi', paid: 300, w: 2 },
          { name: 'An', paid: 0, fix: 1.5, note: 'x' },
        ],
      },
      'khong-phai-bill',
      { id: 'b2', people: 'hong' },
    ];
    const out = billsNghinToVnd(raw) as any[];
    expect(out[0]).toEqual({
      id: 'b1',
      title: 'Ăn',
      extra: 1,
      people: [
        { name: 'Tôi', paid: 300_000, w: 2 },
        { name: 'An', paid: 0, fix: 1500, note: 'x' },
      ],
    });
    expect(out[1]).toBe('khong-phai-bill');
    expect(out[2]).toBe(raw[2]);
    expect((raw[0] as any).people[0].paid).toBe(300); // không sửa bản gốc
  });

  it('bill: người không có paid / fix thì không thêm trường', () => {
    const out = billsNghinToVnd([{ id: 'b', people: [{ name: 'A' }] }]) as any[];
    expect(out[0].people[0]).toEqual({ name: 'A' });
  });

  it('khoản trả: đổi amt, giữ nguyên trường khác', () => {
    const raw = [{ id: 'p1', amt: 120.5, kind: 'vay', exp: [{ m: '2025-10', id: 'x' }] }, { id: 'p2' }, 5];
    const out = paysNghinToVnd(raw) as any[];
    expect(out[0]).toEqual({ id: 'p1', amt: 120_500, kind: 'vay', exp: [{ m: '2025-10', id: 'x' }] });
    expect(out[1]).toEqual({ id: 'p2' });
    expect(out[2]).toBe(5);
  });
});
