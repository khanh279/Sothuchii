import AsyncStorage from '@react-native-async-storage/async-storage';

import { FundInputError, createAdvance, loadFundData, saveFundExpense, saveFundTxn, updateFundTxn } from './fundRepository';
import { PAYOUT_NO_CASH_MESSAGE, fundPosition, maxPayoutNow } from '@/domain/fundAdvance';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const KEY = 'quy_nhom_v1';
const raw = async () => JSON.parse((await AsyncStorage.getItem(KEY)) as string);
const D = '2025-10-05';
const seed = (cash: number) =>
  AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      funds: [{ id: 'f1', name: 'Quỹ lớp' }],
      contribs: cash > 0 ? [{ id: 'c1', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people: [{ name: 'An', amount: cash }] }] : [],
      expenses: [],
      cur: 'f1',
    }),
  );
const personal = (amount: number) => saveFundExpense({ fundId: 'f1', title: 'Cá nhân ứng', date: D, amount, mode: 'personal', payer: 'A' }) as Promise<string>;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('quỹ trả cá nhân chỉ được bằng tiền thực tế trong quỹ', () => {
  it('quỹ hết tiền: không thanh toán được, báo đúng thông báo và không ghi gì', async () => {
    await seed(0);
    const e = await personal(300_000);
    await expect(saveFundTxn({ kind: 'payout', expenseId: e, amount: 1, date: D })).rejects.toThrow(PAYOUT_NO_CASH_MESSAGE);
    expect((await raw()).fundTxns ?? []).toEqual([]);
    const data = await loadFundData();
    expect(maxPayoutNow(data, { fundId: 'f1', remaining: 300_000 })).toBe(0);
  });

  it('quỹ còn tiền nhưng ít hơn số nợ: tối đa bằng số dư (đúng bằng được, hơn 1 đồng thì chặn)', async () => {
    await seed(200_000);
    const e = await personal(300_000);
    const data = await loadFundData();
    expect(maxPayoutNow(data, { fundId: 'f1', remaining: 300_000 })).toBe(200_000);
    await expect(saveFundTxn({ kind: 'payout', expenseId: e, amount: 200_001, date: D })).rejects.toThrow('Tối đa có thể thanh toán: 200.000');
    await saveFundTxn({ kind: 'payout', expenseId: e, amount: 200_000, date: D });
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 0, owed: 100_000 });
    // hết tiền rồi thì khoản còn lại 100.000 không trả được nữa
    await expect(saveFundTxn({ kind: 'payout', expenseId: e, amount: 1, date: D })).rejects.toBeInstanceOf(FundInputError);
  });

  it('quỹ nhiều tiền hơn số nợ: trả đủ như cũ; sửa giao dịch tính lại cả số đã trả của chính nó', async () => {
    await seed(500_000);
    const e = await personal(300_000);
    const t = await saveFundTxn({ kind: 'payout', expenseId: e, amount: 100_000, date: D });
    expect(await updateFundTxn(t, { amount: 300_000, date: D })).toBe(true);
    await expect(updateFundTxn(t, { amount: 300_001, date: D })).rejects.toBeInstanceOf(FundInputError);
  });

  it('hoàn tiền ứng là tiền vào quỹ nên không bị giới hạn bởi số dư (kể cả quỹ hết tiền)', async () => {
    await seed(100_000);
    const a = await createAdvance({ fundId: 'f1', person: 'C', title: 'Ứng', date: D, amount: 100_000 }); // quỹ về 0
    expect(fundPosition(await loadFundData(), 'f1').cash).toBe(0);
    await saveFundTxn({ kind: 'refund', advanceId: a, amount: 100_000, date: D });
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 100_000, held: 0 });
  });
});
