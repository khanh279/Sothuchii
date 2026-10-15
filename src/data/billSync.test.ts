import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadBills } from './billRepository';
import { deleteBillSynced, saveBillSynced } from './billService';
import { syncBillExpenses } from './billSync';
import { createExpense } from './expenseRepository';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền của bill là NGHÌN đồng.
const KEY = 'chiabill:v2:bills';
const json = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const p = (name: string, paid: number, extra: { w?: number; fix?: number } = {}) => ({ name, paid, ...extra });
const three = [p('Tôi', 150), p('B', 0), p('C', 0)];
const userExp = { a: 99_000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1 };
const month = async (m: string) => Object.entries((await json(`sct:m:${m}`)) ?? {}) as [string, Record<string, unknown>][];
const linked = async (m: string) => (await month(m)).map(([, v]) => v).filter((v) => v.src === 'cb');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('syncBillExpenses', () => {
  it('chưa có dữ liệu bill → bỏ qua, KHÔNG xoá khoản src:"cb" có sẵn', async () => {
    await createExpense('c1', { a: 5000, c: 'food', n: 'x', d: '2025-10-05', t: 1, src: 'cb' });
    expect((await syncBillExpenses()).skipped).toBe('no-bill-data');
    expect(await month('2025-10')).toHaveLength(1);
  });

  it('dữ liệu bill không phải mảng → lỗi, không xoá gì', async () => {
    await createExpense('c1', { a: 5000, c: 'food', n: 'x', d: '2025-10-05', t: 1, src: 'cb' });
    await AsyncStorage.setItem(KEY, '{"a":1}');
    await expect(syncBillExpenses()).rejects.toThrow();
    expect(await month('2025-10')).toHaveLength(1);
  });

  it('thêm bill: 150 nghìn của "Tôi" chia 3 → khoản chi cá nhân 50.000 ĐỒNG, ghi exp, lần hai không làm gì', async () => {
    const saved = await saveBillSynced({ title: 'Ăn trưa', date: '2025-10-05', cat: 'food', people: three });
    expect(saved.syncFailed).toBe(false);
    const [expense] = await linked('2025-10');
    expect(expense).toMatchObject({ a: 50_000, c: 'food', n: 'Ăn trưa', d: '2025-10-05', i: 'Chia bill 05/10 · 3 người', src: 'cb' });
    expect((await loadBills())[0].exp?.m).toBe('2025-10');
    expect(await syncBillExpenses()).toMatchObject({ added: 0, replaced: 0, unlinked: 0, orphansRemoved: 0, linksWritten: 0 });
    expect(await linked('2025-10')).toHaveLength(1);
  });

  it('lưu bill nhớ nhóm người cho lần sau', async () => {
    await saveBillSynced({ title: 'x', people: three });
    expect(await json('chiabill:names')).toEqual(['Tôi', 'B', 'C']);
  });

  it('bill không có "Tôi" → không tạo khoản chi', async () => {
    await saveBillSynced({ title: 'x', date: '2025-10-05', people: [p('A', 100), p('B', 0)] });
    expect(await AsyncStorage.getItem('sct:m:2025-10')).toBeNull();
  });

  it('sửa số tiền và đổi sang tháng khác → khoản cũ biến mất, khoản mới ở tháng mới', async () => {
    const id = (await saveBillSynced({ title: 'T', date: '2025-10-05', people: three })).value as string;
    await saveBillSynced({ id, title: 'T', date: '2025-11-02', people: [p('Tôi', 90), p('B', 0)] });
    expect(await linked('2025-10')).toHaveLength(0);
    expect(await linked('2025-11')).toMatchObject([{ a: 45_000, d: '2025-11-02', i: 'Chia bill 02/11 · 2 người' }]);
    expect((await loadBills())[0].exp?.m).toBe('2025-11');
  });

  it('"Tôi" trả ít hơn phần mình → ghi số đã trả kèm "Trả trước"', async () => {
    await saveBillSynced({ title: 'T', date: '2025-10-05', people: [p('Tôi', 20), p('B', 70)] });
    expect(await linked('2025-10')).toMatchObject([{ a: 20_000, i: 'Chia bill 05/10 · 2 người\nTrả trước 20.000 ₫' }]);
  });

  it('bỏ "Tôi" khỏi bill → xoá khoản chi cá nhân và bỏ liên kết', async () => {
    const id = (await saveBillSynced({ title: 'T', date: '2025-10-05', people: three })).value as string;
    await saveBillSynced({ id, title: 'T', date: '2025-10-05', people: [p('A', 150), p('B', 0)] });
    expect(await linked('2025-10')).toHaveLength(0);
    expect((await loadBills())[0].exp).toBeUndefined();
  });

  it('xoá bill → khoản chi cá nhân liên kết bị dọn', async () => {
    const id = (await saveBillSynced({ title: 'T', date: '2025-10-05', people: three })).value as string;
    expect(await deleteBillSynced(id)).toEqual({ value: true, syncFailed: false });
    expect(await linked('2025-10')).toHaveLength(0);
    expect(await json(KEY)).toEqual([]);
  });

  it('KHÔNG đụng khoản người dùng tự nhập, khoản Quỹ (src "quy")', async () => {
    await createExpense('mine', userExp);
    await createExpense('fund', { a: 20_000, c: 'fund', n: 'Quỹ', d: '2025-10-05', t: 1, src: 'quy', i: 'Đóng quỹ · A' });
    const id = (await saveBillSynced({ title: 'T', date: '2025-10-05', people: three })).value as string;
    await saveBillSynced({ id, title: 'T', date: '2025-10-05', people: [p('Tôi', 300), p('B', 0)] });
    await deleteBillSynced(id);
    const entries = Object.fromEntries(await month('2025-10'));
    expect(entries.mine).toEqual(userExp);
    expect(entries.fund).toMatchObject({ src: 'quy', a: 20_000 });
    expect(Object.keys(entries).sort()).toEqual(['fund', 'mine']);
  });

  it('bill.exp trỏ nhầm vào khoản người dùng tự nhập → chỉ bỏ liên kết, khoản đó còn nguyên', async () => {
    await createExpense('mine', userExp);
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([{ id: 'b1', title: 'T', date: '2025-10-05', cat: 'food', createdAt: 1, people: three, exp: { m: '2025-10', id: 'mine' } }]),
    );
    await syncBillExpenses();
    expect((await json('sct:m:2025-10')).mine).toEqual(userExp);
    expect(await linked('2025-10')).toHaveLength(1);
  });

  it('khoản chi của khoản trả nợ (đúng phân bổ) KHÔNG bị xoá; khoản mồ côi thật thì bị xoá', async () => {
    // Tôi nợ An 30 nghìn (bill), đã trả 30 nghìn: khoản chi cá nhân cần có là 30.000 đồng theo bill "Ăn".
    await createExpense('pay', { a: 30_000, c: 'food', n: 'Ăn', i: 'Trả An · bill 01/10', d: '2025-10-05', t: 1, src: 'cb' });
    await createExpense('orphan', { a: 1000, c: 'food', n: 'Mồ côi', d: '2025-10-05', t: 1, src: 'cb' });
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([{ id: 'b1', title: 'Ăn', date: '2025-10-01', cat: 'food', createdAt: 1, people: [p('Tôi', 0), p('An', 60)] }]),
    );
    await AsyncStorage.setItem('chiabill:v2:pays', JSON.stringify([{ id: 'p1', createdAt: 2, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 30, kind: 'billpay', exp: [{ m: '2025-10', id: 'pay' }] }]));
    expect(await syncBillExpenses()).toMatchObject({ orphansRemoved: 1, paysReplaced: 0 });
    const entries = Object.fromEntries(await month('2025-10'));
    expect(Object.keys(entries)).toEqual(['pay']);
  });

  it('dữ liệu thanh toán hỏng → dừng và báo lỗi, không xoá khoản nào', async () => {
    await createExpense('orphan', { a: 1000, c: 'food', n: 'x', d: '2025-10-05', t: 1, src: 'cb' });
    await AsyncStorage.setItem('chiabill:v2:pays', '[hong');
    await AsyncStorage.setItem(KEY, '[]');
    await expect(syncBillExpenses()).rejects.toThrow();
    expect(await month('2025-10')).toHaveLength(1);
    expect(await AsyncStorage.getItem('chiabill:v2:pays')).toBe('[hong');
  });

  it('giữ nguyên trường lạ trong kho bill khi ghi liên kết', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([{ id: 'b1', title: 'T', date: '2025-10-05', cat: 'food', createdAt: 1, people: three, la: 'giữ' }, 'mục lạ']),
    );
    await syncBillExpenses();
    const bills = await json(KEY);
    expect(bills[0].la).toBe('giữ');
    expect(bills[0].exp).toBeDefined();
    expect(bills[1]).toBe('mục lạ');
  });

  it('bill có ngày sai: báo lỗi cho bill đó nhưng vẫn đồng bộ các bill khác', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'bad', title: 'T', date: 'khong-phai-ngay', cat: 'food', createdAt: 1, people: three },
        { id: 'ok', title: 'T', date: '2025-10-05', cat: 'food', createdAt: 2, people: three },
      ]),
    );
    const result = await syncBillExpenses();
    expect(result.added).toBe(1);
    expect(result.failed).toEqual(['Ngày không hợp lệ.']);
    const bills = await loadBills();
    expect(bills.find((b) => b.id === 'bad')?.exp).toBeUndefined();
    expect(bills.find((b) => b.id === 'ok')?.exp).toBeDefined();
  });

  it('gọi dồn nhiều lần không tạo trùng khoản', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([{ id: 'b1', title: 'T', date: '2025-10-05', cat: 'food', createdAt: 1, people: three }]));
    await Promise.all([syncBillExpenses(), syncBillExpenses(), syncBillExpenses()]);
    expect(await linked('2025-10')).toHaveLength(1);
  });

  it('đồng bộ lỗi sau khi đã lưu → báo syncFailed nhưng bill vẫn được lưu', async () => {
    await AsyncStorage.setItem(KEY, '[]');
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('loi doc'));
    const result = await saveBillSynced({ title: 'T', date: '2025-10-05', people: three });
    expect(result.syncFailed).toBe(true);
    expect(await json(KEY)).toHaveLength(1);
  });
});
