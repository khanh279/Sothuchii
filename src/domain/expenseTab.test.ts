import type { Pay } from '@/types/pay';

import { buildPayHistory } from './payForm';
import { countPayRows, expenseLinkLabel, filterPayDays, filterPayDaysByPerson, payLinkLabel, payLinkedExpenses, payRowType, payTypesInUse } from './expenseTab';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Khoản trả: NGHÌN đồng.
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, kind: 'vay', ...over });
const history = (pays: Pay[]) => buildPayHistory(pays, [], { mode: 'all' });

describe('loại khoản trả', () => {
  const pays = [
    pay('loan', 'Tôi', 'An', 100),
    pay('bill', 'Bình', 'Tôi', 50, { kind: 'billpay' }),
    pay('bt', 'Tôi', 'An', 10, { kind: 'bt' }),
  ];

  it('phân loại trả bill / chuyển tiền và không có gộp nợ', () => {
    const days = history(pays).days;
    const types = Object.fromEntries(days.flatMap((d) => d.rows).map((row) => [row.id, payRowType(row)]));
    expect(types).toEqual({ loan: 'loan', bill: 'bill' });
    expect(countPayRows(days)).toBe(2);
  });

  it('chỉ tạo loại có trong dữ liệu', () => {
    expect(payTypesInUse(history(pays).days)).toEqual(['bill', 'loan']);
    expect(payTypesInUse(history([pay('x', 'Tôi', 'An', 5)]).days)).toEqual(['loan']);
    expect(payTypesInUse([])).toEqual([]);
  });

  it('lọc theo loại giữ đúng dòng, bỏ ngày rỗng, không đổi danh sách gốc', () => {
    const days = history([...pays, pay('late', 'Tôi', 'An', 5, { date: '2025-10-06' })]).days;
    expect(countPayRows(filterPayDays(days, 'all'))).toBe(3);
    const loans = filterPayDays(days, 'loan');
    expect(loans.flatMap((d) => d.rows.map((r) => r.id)).sort()).toEqual(['late', 'loan']);
    const bills = filterPayDays(days, 'bill');
    expect(bills).toHaveLength(1);
    expect(bills[0].rows.map((r) => r.id)).toEqual(['bill']);
    expect(countPayRows(days)).toBe(3);
  });

  it('nhóm trả bill giữa hai người khác "Tôi" là trả bill', () => {
    const days = history([pay('g1', 'An', 'Bình', 10, { kind: 'billpay' }), pay('g2', 'An', 'Bình', 20, { kind: 'billpay' })]).days;
    expect(days[0].rows).toHaveLength(1);
    expect(days[0].rows[0].group).toBe(true);
    expect(payRowType(days[0].rows[0])).toBe('bill');
  });
});

describe('liên kết', () => {
  it('nhãn khoản chi theo src, khoản tự nhập thì không có nhãn', () => {
    expect(expenseLinkLabel({ src: 'cb' })).toBe('Liên kết bill');
    expect(expenseLinkLabel({ src: 'quy' })).toBe('Từ quỹ nhóm');
    expect(expenseLinkLabel({})).toBeNull();
  });

  it('khoản trả chỉ có nhãn khi pay.exp có căn cứ, không suy diễn theo nội dung', () => {
    const linked = history([pay('p', 'Tôi', 'An', 30, { kind: 'billpay', exp: [{ m: '2025-10', id: 'e1' }] })]).days[0].rows[0];
    const plain = history([pay('q', 'Tôi', 'An', 30, { kind: 'billpay' })]).days[0].rows[0];
    expect(payLinkedExpenses(linked)).toEqual([{ m: '2025-10', id: 'e1' }]);
    expect(payLinkLabel(linked)).toBe('Đã tính vào chi tiêu');
    expect(payLinkedExpenses(plain)).toEqual([]);
    expect(payLinkLabel(plain)).toBeNull();
  });
});

describe('filterPayDaysByPerson (đối tượng công nợ)', () => {
  const pays = [
    pay('a1', 'Tôi', 'An', 100),
    pay('a2', 'An', 'Tôi', 40, { kind: 'billpay', date: '2025-10-06' }),
    pay('b1', 'Tôi', 'Bình', 70),
    pay('o1', 'An', 'Bình', 30, { kind: 'billpay' }), // giữa hai người khác Tôi
  ];
  const days = history(pays).days;

  it('chỉ giữ khoản giữa Tôi và người đó (cả trả bill lẫn chuyển tiền), bỏ khoản của người khác', () => {
    expect(filterPayDaysByPerson(days, 'An').flatMap((d) => d.rows).map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    expect(filterPayDaysByPerson(days, 'Bình').flatMap((d) => d.rows).map((r) => r.id)).toEqual(['b1']);
    expect(filterPayDaysByPerson(days, 'Chi')).toEqual([]);
  });

  it('không chọn ai thì giữ nguyên toàn bộ và không đổi danh sách gốc', () => {
    expect(filterPayDaysByPerson(days, '')).toEqual(days);
    expect(countPayRows(days)).toBe(4);
  });
});
