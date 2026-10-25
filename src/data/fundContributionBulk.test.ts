import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadFundData, saveContribution } from './fundRepository';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const KEY = 'quy_nhom_v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('chiabill:unit', 'vnd');
  await AsyncStorage.setItem(KEY, JSON.stringify({ funds: [{ id: 'f1', name: 'Quỹ' }], contribs: [], expenses: [], advances: [], fundTxns: [], cur: 'f1' }));
});

describe('khoản thu dùng "Thêm nhiều thành viên" (cờ bulk)', () => {
  const people = [
    { name: 'Người 1', amount: 50_000 },
    { name: 'Người 2', amount: 50_000 },
  ];

  it('lưu cờ bulk khi bật và đọc lại được', async () => {
    await saveContribution({ fundId: 'f1', title: 'Đóng', date: '2025-10-01', people, bulk: true });
    expect((await loadFundData()).contribs[0].bulk).toBe(true);
  });

  it('không bật thì không có cờ (dữ liệu giống dữ liệu cũ)', async () => {
    await saveContribution({ fundId: 'f1', title: 'Đóng', date: '2025-10-01', people });
    expect((await loadFundData()).contribs[0]).not.toHaveProperty('bulk');
  });

  it('sửa không còn dùng nhiều thành viên thì gỡ cờ cũ', async () => {
    const id = await saveContribution({ fundId: 'f1', title: 'Đóng', date: '2025-10-01', people, bulk: true });
    await saveContribution({ id: id ?? '', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people });
    expect((await loadFundData()).contribs[0]).not.toHaveProperty('bulk');
  });
});
