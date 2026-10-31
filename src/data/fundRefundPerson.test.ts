import AsyncStorage from '@react-native-async-storage/async-storage';

import { fundPosition } from '@/domain/fundAdvance';
import { fundBalance } from '@/domain/funds';

import { loadFundData, refundAdvancesForPerson } from './fundRepository';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const KEY = 'quy_nhom_v1';
const seed = () =>
  AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      funds: [{ id: 'f1', name: 'Quỹ' }],
      contribs: [{ id: 'c1', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people: [{ name: 'Bình', amount: 5_000_000 }] }],
      // lần cũ 200.000 đã chi 150.000; lần mới 300.000 chưa chi đồng nào
      advances: [
        { id: 'a1', fundId: 'f1', person: 'An', title: '', date: '2025-10-22', amount: 200_000 },
        { id: 'a2', fundId: 'f1', person: 'An', title: '', date: '2025-10-24', amount: 300_000 },
      ],
      expenses: [{ id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-23', amount: 150_000, mode: 'advance', payer: 'An', advanceId: 'a1' }],
      fundTxns: [],
      cur: 'f1',
    }),
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  await seed();
});

describe('hoàn tiền ứng theo người', () => {
  it('hoàn hết lần mới chưa chi: lần đó bị xoá (không có giao dịch hoàn), số dư quỹ không đổi', async () => {
    const start = await loadFundData();
    const before = fundPosition(start, 'f1').cash;
    const balanceBefore = fundBalance(start, 'f1');
    expect(await refundAdvancesForPerson({ fundId: 'f1', person: 'An', amount: 300_000, date: '2025-10-25' })).toEqual({ recorded: 0, removed: 1 });
    const data = await loadFundData();
    expect(data.advances?.map((a) => a.id)).toEqual(['a1']);
    expect(data.txns ?? []).toEqual([]);
    expect(fundPosition(data, 'f1').cash).toBe(before); // hoàn tiền ứng chưa chi chỉ đóng công nợ, số còn lại của quỹ không đổi
    expect(fundBalance(data, 'f1')).toBe(balanceBefore);
  });

  it('hoàn nhiều hơn lần mới: lần mới xoá, phần dư ghi giao dịch hoàn vào lần cũ', async () => {
    expect(await refundAdvancesForPerson({ fundId: 'f1', person: 'An', amount: 330_000, date: '2025-10-25' })).toEqual({ recorded: 1, removed: 1 });
    const data = await loadFundData();
    expect(data.advances?.map((a) => a.id)).toEqual(['a1']);
    expect(data.txns?.map((t) => [t.advanceId, t.amount])).toEqual([['a1', 30_000]]);
  });

  it('hoàn một phần lần mới: ghi giao dịch hoàn, lần giao còn nguyên', async () => {
    expect(await refundAdvancesForPerson({ fundId: 'f1', person: 'An', amount: 100_000, date: '2025-10-25' })).toEqual({ recorded: 1, removed: 0 });
    const data = await loadFundData();
    expect(data.advances).toHaveLength(2);
    expect(data.txns?.map((t) => [t.advanceId, t.amount])).toEqual([['a2', 100_000]]);
  });

  it('hoàn vượt tổng còn giữ thì báo lỗi và không ghi gì', async () => {
    await expect(refundAdvancesForPerson({ fundId: 'f1', person: 'An', amount: 400_000, date: '2025-10-25' })).rejects.toThrow();
    expect((await loadFundData()).advances).toHaveLength(2);
  });
});
