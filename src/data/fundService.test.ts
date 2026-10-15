import AsyncStorage from '@react-native-async-storage/async-storage';

import { createExpense } from './expenseRepository';
import { saveContribution } from './fundRepository';
import { createFundSynced, deleteFundSynced, renameFundSynced } from './fundService';
import { syncFundExpenses } from './fundSync';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const json = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const userExp = { a: 99_000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1 };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('fundService', () => {
  it('tạo quỹ rồi đổi tên: kho Quỹ có tên mới, tiền cá nhân không bị động', async () => {
    await createExpense('mine', userExp);
    const created = await createFundSynced('  Quỹ ăn trưa ');
    expect(created).toMatchObject({ value: { name: 'Quỹ ăn trưa' }, syncFailed: false });
    expect(await renameFundSynced(created.value.id, 'Quỹ lớp')).toEqual({ value: true, syncFailed: false });
    expect((await json('quy_nhom_v1')).funds).toEqual([{ id: created.value.id, name: 'Quỹ lớp' }]);
    expect((await json('sct:m:2025-10')).mine).toEqual(userExp);
  });

  it('đổi tên quỹ cập nhật dòng chi tiết của khoản chi cá nhân liên kết', async () => {
    const { value: fund } = await createFundSynced('Cũ');
    await saveContribution({ fundId: fund.id, title: 'T', date: '2025-10-05', people: [{ name: 'Tôi', amount: 50_000 }] });
    await syncFundExpenses();
    await renameFundSynced(fund.id, 'Mới');
    const [entry] = Object.values(await json('sct:m:2025-10')) as { i: string; a: number }[];
    expect(entry).toMatchObject({ a: 50_000, i: 'Đóng quỹ · Mới' });
  });

  it('xoá quỹ dọn khoản chi cá nhân từ quỹ đó, giữ khoản của quỹ khác và khoản người dùng tự nhập', async () => {
    await createExpense('mine', userExp);
    const a = (await createFundSynced('A')).value;
    const b = (await createFundSynced('B')).value;
    await saveContribution({ fundId: a.id, title: 'a', date: '2025-10-05', people: [{ name: 'Tôi', amount: 10_000 }] });
    await saveContribution({ fundId: b.id, title: 'b', date: '2025-10-06', people: [{ name: 'Tôi', amount: 20_000 }] });
    await syncFundExpenses();
    expect(Object.keys(await json('sct:m:2025-10'))).toHaveLength(3);

    expect(await deleteFundSynced(a.id)).toEqual({ value: true, syncFailed: false });
    const left = Object.values(await json('sct:m:2025-10')) as { n: string }[];
    expect(left.map((e) => e.n).sort()).toEqual(['Phở', 'b']);
    expect((await json('quy_nhom_v1')).funds).toEqual([b]);
  });

  it('xoá quỹ không có thật → false, không đổi gì', async () => {
    const { value: fund } = await createFundSynced('A');
    expect(await deleteFundSynced('khong-co')).toMatchObject({ value: false });
    expect((await json('quy_nhom_v1')).funds).toEqual([fund]);
  });

  it('đồng bộ lỗi sau khi đã lưu → báo syncFailed nhưng thay đổi vẫn còn', async () => {
    await AsyncStorage.setItem('quy_nhom_v1', JSON.stringify({ funds: [], contribs: [], expenses: [] }));
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('loi doc'));
    const result = await createFundSynced('A');
    expect(result.syncFailed).toBe(true);
    expect((await json('quy_nhom_v1')).funds).toHaveLength(1);
  });
});
