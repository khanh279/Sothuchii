import AsyncStorage from '@react-native-async-storage/async-storage';

import { advanceSummary } from '@/domain/fundAdvance';

import { loadFundData, updateAdvance } from './fundRepository';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const KEY = 'quy_nhom_v1';
const seed = (extra: Record<string, unknown> = {}) =>
  AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      funds: [{ id: 'f1', name: 'Quỹ' }],
      contribs: [{ id: 'c1', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people: [{ name: 'Bình', amount: 5_000_000 }] }],
      advances: [
        { id: 'a1', fundId: 'f1', person: 'An', title: '', date: '2025-10-02', amount: 300_000 },
        { id: 'a2', fundId: 'f1', person: 'An', title: '', date: '2025-10-03', amount: 200_000 },
      ],
      // một khoản chi 350.000 đã được chia: 300.000 vào lần giao cũ a1, 50.000 vào a2
      expenses: [
        { id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 300_000, mode: 'advance', payer: 'An', advanceId: 'a1' },
        { id: 'x2', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 50_000, mode: 'advance', payer: 'An', advanceId: 'a2' },
      ],
      fundTxns: [],
      cur: 'f1',
      ...extra,
    }),
  );
const spendOf = async () => {
  const data = await loadFundData();
  return Object.fromEntries((data.advances ?? []).map((advance) => [advance.id, advanceSummary(data, advance).spent]));
};
const pieces = async () => (await loadFundData()).expenses.map((e) => [e.advanceId, e.amount]);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('sửa hồ sơ giao ứng → phân bổ lại các khoản chi', () => {
  it('TĂNG lần giao cũ: khoản chi dồn hết vào lần cũ (không giữ phân bổ cũ 300.000 / 50.000)', async () => {
    await seed();
    expect(await updateAdvance('a1', { title: '', date: '2025-10-02', amount: 400_000 })).toBe(true);
    expect(await spendOf()).toEqual({ a1: 350_000, a2: 0 });
    expect(await pieces()).toEqual([['a1', 350_000]]); // phần thừa không còn cần: gộp vào một phần
  });

  it('GIẢM lần giao cũ: phần vượt chuyển sang lần giao kế; tổng khoản chi không đổi', async () => {
    await seed();
    await updateAdvance('a1', { title: '', date: '2025-10-02', amount: 150_000 });
    expect(await spendOf()).toEqual({ a1: 150_000, a2: 200_000 });
    const total = (await loadFundData()).expenses.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(350_000);
  });

  it('GIẢM cả hai lần giao thấp hơn tổng chi: phần vượt ghi vào lần giao mới nhất (thành quỹ nợ)', async () => {
    await seed();
    await updateAdvance('a2', { title: '', date: '2025-10-03', amount: 10_000 });
    expect(await spendOf()).toEqual({ a1: 300_000, a2: 50_000 });
    await updateAdvance('a1', { title: '', date: '2025-10-02', amount: 100_000 });
    expect(await spendOf()).toEqual({ a1: 100_000, a2: 250_000 });
  });

  it('đổi NGÀY làm lần giao mới thành cũ hơn: khoản chi lấp lần giao đó trước', async () => {
    await seed();
    await updateAdvance('a2', { title: '', date: '2025-10-01', amount: 200_000 });
    expect(await spendOf()).toEqual({ a1: 150_000, a2: 200_000 });
  });

  it('chỉ đổi nội dung (không đổi tiền, ngày) thì không đụng tới khoản chi', async () => {
    await seed();
    const before = JSON.stringify((await loadFundData()).expenses);
    await updateAdvance('a1', { title: 'Mới', date: '2025-10-02', amount: 300_000 });
    expect(JSON.stringify((await loadFundData()).expenses)).toBe(before);
  });

  it('đã có hoàn tiền / thanh toán gắn vào lần giao của người đó: giữ nguyên phân bổ cũ (không làm lệch giao dịch đó)', async () => {
    await seed({ fundTxns: [{ id: 't1', fundId: 'f1', kind: 'refund', person: 'An', amount: 10_000, date: '2025-10-05', advanceId: 'a2' }] });
    await updateAdvance('a1', { title: '', date: '2025-10-02', amount: 400_000 });
    expect(await pieces()).toEqual([
      ['a1', 300_000],
      ['a2', 50_000],
    ]);
  });

  it('người khác không bị ảnh hưởng', async () => {
    await seed({
      advances: [
        { id: 'a1', fundId: 'f1', person: 'An', title: '', date: '2025-10-02', amount: 300_000 },
        { id: 'a2', fundId: 'f1', person: 'An', title: '', date: '2025-10-03', amount: 200_000 },
        { id: 'b1', fundId: 'f1', person: 'Bình', title: '', date: '2025-10-02', amount: 90_000 },
      ],
      expenses: [
        { id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 300_000, mode: 'advance', payer: 'An', advanceId: 'a1' },
        { id: 'y1', fundId: 'f1', title: 'Thuê sân', date: '2025-10-04', amount: 60_000, mode: 'advance', payer: 'Bình', advanceId: 'b1' },
      ],
    });
    await updateAdvance('a1', { title: '', date: '2025-10-02', amount: 100_000 });
    const rows = (await loadFundData()).expenses.map((e) => [e.id, e.advanceId, e.amount]);
    expect(rows).toEqual(expect.arrayContaining([['y1', 'b1', 60_000]]));
    expect(await spendOf()).toMatchObject({ a1: 100_000, a2: 200_000, b1: 60_000 });
  });
});
