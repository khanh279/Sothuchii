import { billPeopleNames, filterBillsByPerson } from './billHistory';
import { payPeopleNames, filterPayDaysByPerson } from './expenseTab';
import type { PayDay, PayRow } from './payForm';

const bill = (id: string, names: string[]) => ({ id, people: names.map((name) => ({ name, paid: 0 })) });

describe('lọc theo tên người ở danh sách bill', () => {
  const bills = [bill('1', ['Tôi', 'An']), bill('2', ['Tôi', 'Bình']), bill('3', ['Tôi', 'An', 'Bình'])];

  it('gom tên theo thứ tự xuất hiện, không trùng', () => {
    expect(billPeopleNames(bills)).toEqual(['Tôi', 'An', 'Bình']);
    expect(billPeopleNames([])).toEqual([]);
  });

  it('chỉ giữ bill có người đó; rỗng thì giữ nguyên', () => {
    expect(filterBillsByPerson(bills, 'An').map((b) => b.id)).toEqual(['1', '3']);
    expect(filterBillsByPerson(bills, 'Bình').map((b) => b.id)).toEqual(['2', '3']);
    expect(filterBillsByPerson(bills, '')).toHaveLength(3);
    expect(filterBillsByPerson(bills, 'Không có')).toEqual([]);
  });
});

describe('lọc theo tên người ở lịch sử giao dịch', () => {
  const row = (id: string, from: string, to: string) => ({ ids: [id], id, from, to, amt: 10 }) as unknown as PayRow;
  const days: PayDay[] = [
    { date: '2026-10-19', rows: [row('a', 'An', 'Tôi'), row('b', 'Tôi', 'Bình')] } as unknown as PayDay,
    { date: '2026-10-18', rows: [row('c', 'An', 'Bình'), row('d', 'Tôi', 'An')] } as unknown as PayDay,
  ];

  it('chỉ lấy tên người có giao dịch với Tôi, không trùng', () => {
    expect(payPeopleNames(days)).toEqual(['An', 'Bình']);
    expect(payPeopleNames([])).toEqual([]);
  });

  it('lọc đúng giao dịch giữa Tôi và người đó', () => {
    expect(filterPayDaysByPerson(days, 'An').flatMap((d) => d.rows.map((r) => r.id))).toEqual(['a', 'd']);
    expect(filterPayDaysByPerson(days, '').flatMap((d) => d.rows)).toHaveLength(4);
  });
});
