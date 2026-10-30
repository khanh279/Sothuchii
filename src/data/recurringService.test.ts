import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadMonth, loadSettings, saveSettings } from './expenseRepository';
import { applyRecurring } from './recurringService';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật. Tiền: ĐỒNG.
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('chiabill:unit', 'vnd');
  const settings = await loadSettings();
  await saveSettings({ ...settings, recurring: [{ id: 'r1', a: 3_000_000, c: 'home', n: 'Tiền nhà', day: 5, from: '2025-09' }] });
});

describe('applyRecurring', () => {
  it('ghi các tháng đã đến hạn, đánh dấu đã xử lý và chạy lại không ghi trùng', async () => {
    expect(await applyRecurring('2025-10-10', 1)).toBe(2);
    expect((await loadMonth('2025-09')).map((e) => [e.d, e.a, e.n, e.i])).toEqual([['2025-09-05', 3_000_000, 'Tiền nhà', 'Chi tiêu định kỳ']]);
    expect((await loadMonth('2025-10')).map((e) => e.d)).toEqual(['2025-10-05']);
    expect((await loadSettings()).recurring?.[0].done).toBe('2025-10');
    expect(await applyRecurring('2025-10-20', 2)).toBe(0);
    expect(await loadMonth('2025-10')).toHaveLength(1);
  });

  it('khoản đã ghi bị người dùng xoá thì không bị ghi lại; tháng sau vẫn ghi', async () => {
    await applyRecurring('2025-10-10', 1);
    await AsyncStorage.removeItem('sct:m:2025-10');
    expect(await applyRecurring('2025-10-25', 2)).toBe(0);
    expect(await loadMonth('2025-10')).toEqual([]);
    expect(await applyRecurring('2025-11-06', 3)).toBe(1);
  });

  it('chưa có quy tắc hoặc chưa đến hạn thì không ghi gì', async () => {
    expect(await applyRecurring('2025-09-04', 1)).toBe(0);
    await saveSettings({ ...(await loadSettings()), recurring: undefined });
    expect(await applyRecurring('2025-10-10', 1)).toBe(0);
  });
});
