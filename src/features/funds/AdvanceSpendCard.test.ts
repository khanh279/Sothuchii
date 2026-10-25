import type { FundData } from '@/types/fund';

import { lotSpendItems, mergeSameDaySpends } from './AdvanceSpendCard';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU tự tạo, không phải dữ liệu thật. Tiền là ĐỒNG.
const data: FundData = {
  funds: [{ id: 'f1', name: 'Quỹ' }],
  contribs: [],
  advances: [
    { id: 'a1', fundId: 'f1', person: 'An', title: '', date: '2025-10-02', amount: 300_000 },
    { id: 'a2', fundId: 'f1', person: 'An', title: '', date: '2025-10-03', amount: 200_000 },
    { id: 'a3', fundId: 'f1', person: 'An', title: '', date: '2025-10-05', amount: 100_000 },
  ],
  expenses: [
    // một khoản chi 350.000 bị chia vào a1 (300.000) và a2 (50.000)
    { id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 300_000, mode: 'advance', payer: 'An', advanceId: 'a1' },
    { id: 'x2', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 50_000, mode: 'advance', payer: 'An', advanceId: 'a2' },
    { id: 'x3', fundId: 'f1', title: 'Thuê sân', date: '2025-10-06', amount: 80_000, mode: 'advance', payer: 'An', advanceId: 'a3' },
  ],
  txns: [],
  cur: 'f1',
};
const lot = (id: string) => ({ id, fundId: 'f1', person: 'An' });

describe('lotSpendItems / mergeSameDaySpends', () => {
  it('khoản chi chia vào hai lần giao hiện NGUYÊN (một dòng, đủ 350.000) ở cả hai lần giao, kèm các lần giao bị trừ', () => {
    for (const lots of [[lot('a1')], [lot('a2')], [lot('a1'), lot('a2')]]) {
      const rows = mergeSameDaySpends(lotSpendItems(data, lots));
      expect(rows.map((r) => [r.title, r.amount, [...r.advanceIds].sort()])).toEqual([['Mua nước', 350_000, ['a1', 'a2']]]);
    }
  });

  it('chỉ lấy khoản chi có trừ vào lần giao đang xem; lần giao khác không bị lẫn', () => {
    expect(mergeSameDaySpends(lotSpendItems(data, [lot('a3')])).map((r) => [r.title, r.amount])).toEqual([['Thuê sân', 80_000]]);
    expect(lotSpendItems(data, [])).toEqual([]);
  });
});
