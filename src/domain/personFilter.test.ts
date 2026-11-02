import { billPeopleNames, filterBillsByPerson } from './billHistory';

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
