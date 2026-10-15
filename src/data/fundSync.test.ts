import AsyncStorage from '@react-native-async-storage/async-storage';

import { createExpense } from './expenseRepository';
import { loadFundData, saveContribution } from './fundRepository';
import { syncFundExpenses } from './fundSync';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const FUND_KEY = 'quy_nhom_v1';
const json = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const seedFund = (extra: Record<string, unknown> = {}) =>
  AsyncStorage.setItem(FUND_KEY, JSON.stringify({ funds: [{ id: 'f1', name: 'Quỹ ăn trưa' }], contribs: [], expenses: [], ...extra }));
const person = (name: string, amount: number) => ({ name, amount });
const userExp = (over: Record<string, unknown> = {}) => ({ a: 99_000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1, ...over });
/** Mọi khoản chi cá nhân của tháng, dạng mảng. */
const monthOf = async (m: string) => Object.values((await json(`sct:m:${m}`)) ?? {}) as Record<string, unknown>[];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('syncFundExpenses', () => {
  it('chưa có dữ liệu Quỹ → bỏ qua, KHÔNG xoá khoản src:"quy" có sẵn', async () => {
    await createExpense('q1', { a: 5000, c: 'fund', n: 'x', d: '2025-10-05', t: 1, src: 'quy' });
    const result = await syncFundExpenses();
    expect(result.skipped).toBe('no-fund-data');
    expect(await monthOf('2025-10')).toHaveLength(1);
  });

  it('kho Quỹ thiếu mảng contribs/expenses → bỏ qua, không xoá gì', async () => {
    await createExpense('q1', { a: 5000, c: 'fund', n: 'x', d: '2025-10-05', t: 1, src: 'quy' });
    await AsyncStorage.setItem(FUND_KEY, JSON.stringify({ funds: [] }));
    expect((await syncFundExpenses()).skipped).toBe('no-fund-data');
    expect(await monthOf('2025-10')).toHaveLength(1);
  });

  it('thêm lần đóng có phần của "Tôi" → tạo khoản chi cá nhân đúng đơn vị đồng và ghi exp', async () => {
    await seedFund();
    await saveContribution({ fundId: 'f1', title: 'Tháng 10', date: '2025-10-05', people: [person('Tôi', 50_000), person('An', 20_000)] });
    const result = await syncFundExpenses();
    expect(result).toMatchObject({ added: 1, replaced: 0, unlinked: 0, orphansRemoved: 0, linksWritten: 1, failed: [] });

    const [expense] = await monthOf('2025-10');
    expect(expense).toMatchObject({ a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' });
    const { contribs } = await loadFundData();
    expect(contribs[0].exp?.m).toBe('2025-10');
    // lần đồng bộ thứ hai không làm gì
    expect(await syncFundExpenses()).toMatchObject({ added: 0, replaced: 0, unlinked: 0, orphansRemoved: 0, linksWritten: 0 });
    expect(await monthOf('2025-10')).toHaveLength(1);
  });

  it('lần đóng không có phần của "Tôi" → không tạo khoản chi', async () => {
    await seedFund();
    await saveContribution({ fundId: 'f1', title: 'x', date: '2025-10-05', people: [person('An', 20_000)] });
    expect(await syncFundExpenses()).toMatchObject({ added: 0, linksWritten: 0 });
    expect(await AsyncStorage.getItem('sct:m:2025-10')).toBeNull();
  });

  it('sửa số tiền và đổi sang tháng khác → khoản cũ biến mất, khoản mới ở tháng mới', async () => {
    await seedFund();
    const id = (await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 50_000)] })) as string;
    await syncFundExpenses();
    await saveContribution({ id, fundId: 'f1', title: 'T', date: '2025-11-02', people: [person('Tôi', 80_000)] });
    expect(await syncFundExpenses()).toMatchObject({ added: 0, replaced: 1, orphansRemoved: 0 });
    expect(await monthOf('2025-10')).toHaveLength(0);
    expect(await monthOf('2025-11')).toMatchObject([{ a: 80_000, d: '2025-11-02', src: 'quy' }]);
    const { contribs } = await loadFundData();
    expect(contribs[0].exp?.m).toBe('2025-11');
  });

  it('bỏ phần của "Tôi" → xoá khoản chi cá nhân đã tạo và bỏ liên kết', async () => {
    await seedFund();
    const id = (await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 50_000)] })) as string;
    await syncFundExpenses();
    await saveContribution({ id, fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('An', 50_000)] });
    expect(await syncFundExpenses()).toMatchObject({ unlinked: 1 });
    expect(await monthOf('2025-10')).toHaveLength(0);
    expect((await loadFundData()).contribs[0].exp).toBeUndefined();
  });

  it('đổi tên quỹ → dòng chi tiết `i` được cập nhật', async () => {
    await seedFund();
    await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 1000)] });
    await syncFundExpenses();
    const raw = await json(FUND_KEY);
    raw.funds[0].name = 'Quỹ mới';
    await AsyncStorage.setItem(FUND_KEY, JSON.stringify(raw));
    expect(await syncFundExpenses()).toMatchObject({ replaced: 1 });
    expect((await monthOf('2025-10'))[0].i).toBe('Đóng quỹ · Quỹ mới');
  });

  it('xoá lần đóng → khoản chi cá nhân liên kết bị dọn như khoản mồ côi', async () => {
    await seedFund();
    await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 50_000)] });
    await syncFundExpenses();
    const raw = await json(FUND_KEY);
    raw.contribs = [];
    await AsyncStorage.setItem(FUND_KEY, JSON.stringify(raw));
    expect(await syncFundExpenses()).toMatchObject({ orphansRemoved: 1 });
    expect(await monthOf('2025-10')).toHaveLength(0);
  });

  it('KHÔNG đụng khoản chi người dùng tự nhập và khoản Chia bill (src "cb")', async () => {
    await createExpense('mine', userExp());
    await createExpense('bill', userExp({ a: 20_000, c: 'bill', src: 'cb', i: 'Chia bill' }));
    await seedFund();
    const id = (await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 50_000)] })) as string;
    await syncFundExpenses();
    await saveContribution({ id, fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 60_000)] });
    await syncFundExpenses();
    const raw = await json(FUND_KEY);
    raw.contribs = [];
    await AsyncStorage.setItem(FUND_KEY, JSON.stringify(raw));
    await syncFundExpenses();

    const entries = await json('sct:m:2025-10');
    expect(entries.mine).toEqual(userExp());
    expect(entries.bill).toEqual(userExp({ a: 20_000, c: 'bill', src: 'cb', i: 'Chia bill' }));
    expect(Object.keys(entries).sort()).toEqual(['bill', 'mine']);
  });

  it('exp trỏ nhầm vào khoản người dùng tự nhập → chỉ bỏ liên kết, khoản đó còn nguyên', async () => {
    await createExpense('mine', userExp());
    await seedFund({
      contribs: [
        { id: 'c1', fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 50_000)], exp: { m: '2025-10', id: 'mine' } },
      ],
    });
    await syncFundExpenses();
    expect((await json('sct:m:2025-10')).mine).toEqual(userExp());
    expect(await monthOf('2025-10')).toHaveLength(2); // khoản của người dùng + khoản liên kết mới
  });

  it('giữ nguyên trường lạ trong kho Quỹ khi ghi liên kết', async () => {
    await seedFund({
      moi: { x: 1 },
      contribs: [{ id: 'c1', fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 5000)], la: 'giữ' }],
    });
    await syncFundExpenses();
    const raw = await json(FUND_KEY);
    expect(raw.moi).toEqual({ x: 1 });
    expect(raw.contribs[0].la).toBe('giữ');
    expect(raw.contribs[0].exp).toBeDefined();
  });

  it('lần đóng có ngày sai: báo lỗi cho lần đó nhưng vẫn đồng bộ các lần khác', async () => {
    await seedFund({
      contribs: [
        { id: 'bad', fundId: 'f1', title: 'T', date: 'khong-phai-ngay', people: [person('Tôi', 5000)] },
        { id: 'ok', fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 7000)] },
      ],
    });
    const result = await syncFundExpenses();
    expect(result.added).toBe(1);
    expect(result.failed).toEqual(['Ngày không hợp lệ.']);
    expect(await monthOf('2025-10')).toMatchObject([{ a: 7000 }]);
    const { contribs } = await loadFundData();
    expect(contribs.find((c) => c.id === 'bad')?.exp).toBeUndefined();
  });

  it('lần đóng thiếu id không bị tạo khoản chi lặp mỗi lần đồng bộ', async () => {
    await seedFund({ contribs: [{ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 5000)] }] });
    expect(await syncFundExpenses()).toMatchObject({ added: 0 });
    expect(await AsyncStorage.getItem('sct:m:2025-10')).toBeNull();
  });

  it('kho Quỹ hỏng → ném lỗi, không xoá/ghi gì', async () => {
    await createExpense('q1', { a: 5000, c: 'fund', n: 'x', d: '2025-10-05', t: 1, src: 'quy' });
    await AsyncStorage.setItem(FUND_KEY, '{hong');
    await expect(syncFundExpenses()).rejects.toThrow();
    expect(await monthOf('2025-10')).toHaveLength(1);
    expect(await AsyncStorage.getItem(FUND_KEY)).toBe('{hong');
  });

  it('gọi dồn nhiều lần không tạo trùng khoản', async () => {
    await seedFund();
    await saveContribution({ fundId: 'f1', title: 'T', date: '2025-10-05', people: [person('Tôi', 5000)] });
    await Promise.all([syncFundExpenses(), syncFundExpenses(), syncFundExpenses()]);
    expect(await monthOf('2025-10')).toHaveLength(1);
  });
});
