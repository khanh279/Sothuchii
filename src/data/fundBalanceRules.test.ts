import AsyncStorage from '@react-native-async-storage/async-storage';

import { FundInputError, createAdvance, loadFundData, saveFundExpense, saveFundTxn, updateAdvance, updateFundTxn } from './fundRepository';
import { fundPosition } from '@/domain/fundAdvance';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const KEY = 'quy_nhom_v1';
const raw = async () => JSON.parse((await AsyncStorage.getItem(KEY)) as string);
const seed = (value: unknown) => AsyncStorage.setItem(KEY, JSON.stringify(value));
const D = '2025-10-05';
const withCash = (cash: number) => ({
  funds: [{ id: 'f1', name: 'Quỹ lớp' }],
  contribs: cash > 0 ? [{ id: 'c1', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people: [{ name: 'Tôi', amount: cash }] }] : [],
  expenses: [],
  cur: 'f1',
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('chi / giao tiền ứng theo số dư quỹ', () => {
  it('quỹ 0 đồng: chi trực tiếp bị chặn và không ghi gì; cá nhân ứng chi vẫn được', async () => {
    await seed(withCash(0));
    await expect(saveFundExpense({ fundId: 'f1', title: 'x', date: D, amount: 1_000 })).rejects.toThrow('Không thể ghi chi tiêu do số dư quỹ không đủ.');
    expect((await raw()).expenses).toEqual([]);
    await saveFundExpense({ fundId: 'f1', title: 'Cá nhân ứng', date: D, amount: 1_000, mode: 'personal', payer: 'A' });
    expect((await raw()).expenses).toHaveLength(1);
  });

  it('quỹ dương nhưng không đủ: chặn; đúng bằng số dư: cho phép (về 0)', async () => {
    await seed(withCash(500_000));
    await expect(saveFundExpense({ fundId: 'f1', title: 'x', date: D, amount: 500_001 })).rejects.toBeInstanceOf(FundInputError);
    await saveFundExpense({ fundId: 'f1', title: 'Đúng bằng', date: D, amount: 500_000 });
    expect(fundPosition(await loadFundData(), 'f1').cash).toBe(0);
  });

  it('kiểm tra lại lúc ghi: số dư đã giảm sau khi mở form thì khoản chi bị chặn', async () => {
    await seed(withCash(500_000));
    await saveFundExpense({ fundId: 'f1', title: 'Chi trước', date: D, amount: 400_000 }); // form kia vẫn thấy 500.000
    await expect(saveFundExpense({ fundId: 'f1', title: 'Chi sau', date: D, amount: 300_000 })).rejects.toBeInstanceOf(FundInputError);
    expect((await raw()).expenses).toHaveLength(1);
  });

  it('giao tiền ứng: ≤ số dư thì được (kể cả đúng bằng), vượt thì chặn và nói số tối đa; số 0 bị từ chối', async () => {
    await seed(withCash(500_000));
    await expect(createAdvance({ fundId: 'f1', person: 'A', title: 'x', date: D, amount: 500_001 })).rejects.toThrow('Số tiền giao vượt quá số dư quỹ');
    expect((await raw()).advances ?? []).toEqual([]);
    await createAdvance({ fundId: 'f1', person: 'A', title: 'Đủ', date: D, amount: 500_000 });
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 0, balance: 500_000 });
    await expect(createAdvance({ fundId: 'f1', person: 'B', title: 'Hết tiền', date: D, amount: 1 })).rejects.toBeInstanceOf(FundInputError);
    await expect(createAdvance({ fundId: 'f1', person: 'B', title: 'Giao việc', date: D, amount: 0 })).rejects.toThrow('Nhập số tiền lớn hơn 0'); // số tiền giao phải khác 0
  });

  it('chi từ tiền ứng và cá nhân ứng không bị chặn bởi số dư (không lấy thêm tiền khỏi quỹ)', async () => {
    await seed(withCash(500_000));
    const a = await createAdvance({ fundId: 'f1', person: 'A', title: 'Mua', date: D, amount: 500_000 });
    await saveFundExpense({ fundId: 'f1', title: 'Chi từ ứng', date: D, amount: 700_000, mode: 'advance', advanceId: a });
    expect((await raw()).expenses).toHaveLength(1);
  });

  it('sửa khoản chi trực tiếp: tăng quá số dư bị chặn (tính lại số cũ), giảm hoặc đổi nội dung luôn được', async () => {
    await seed(withCash(500_000));
    const id = (await saveFundExpense({ fundId: 'f1', title: 'Chi', date: D, amount: 300_000 })) as string; // còn 200.000
    await expect(saveFundExpense({ id, fundId: 'f1', title: 'Chi', date: D, amount: 500_001 })).rejects.toBeInstanceOf(FundInputError);
    await saveFundExpense({ id, fundId: 'f1', title: 'Chi', date: D, amount: 500_000 }); // 300.000 cũ + 200.000 còn lại
    await saveFundExpense({ id, fundId: 'f1', title: 'Đổi tên', date: D, amount: 100_000 });
    expect((await raw()).expenses[0]).toMatchObject({ id, title: 'Đổi tên', amount: 100_000 });
  });
});

describe('sửa hồ sơ giao tiền ứng và giao dịch hoàn tiền / thanh toán', () => {
  it('updateAdvance: đổi nội dung / ngày / số tiền đúng hồ sơ, giữ người nhận; tăng quá số dư bị chặn', async () => {
    await seed(withCash(1_000_000));
    const a = await createAdvance({ fundId: 'f1', person: 'A', title: 'Mua', date: D, amount: 400_000 });
    expect(await updateAdvance(a, { title: 'Mua vật tư', date: '2025-10-06', amount: 1_000_000 })).toBe(true); // 400.000 cũ + 600.000 còn lại
    expect((await raw()).advances).toEqual([{ id: a, fundId: 'f1', person: 'A', title: 'Mua vật tư', date: '2025-10-06', amount: 1_000_000 }]);
    await expect(updateAdvance(a, { title: 'x', date: D, amount: 1_000_001 })).rejects.toBeInstanceOf(FundInputError);
    expect(await updateAdvance('khong-co', { title: 'x', date: D, amount: 1 })).toBe(false);
  });

  it('updateFundTxn (hoàn tiền): sửa đúng giao dịch, không vượt số còn giữ, không tạo bản ghi mới', async () => {
    await seed(withCash(1_000_000));
    const a = await createAdvance({ fundId: 'f1', person: 'A', title: 'Mua', date: D, amount: 500_000 });
    await saveFundExpense({ fundId: 'f1', title: 'Chi', date: D, amount: 100_000, mode: 'advance', advanceId: a }); // còn giữ 400.000
    const t = await saveFundTxn({ kind: 'refund', advanceId: a, amount: 100_000, date: D });
    expect(await updateFundTxn(t, { amount: 400_000, date: '2025-10-07' })).toBe(true); // 100.000 cũ + 300.000 còn giữ
    expect((await raw()).fundTxns).toEqual([{ id: t, fundId: 'f1', kind: 'refund', person: 'A', amount: 400_000, date: '2025-10-07', advanceId: a }]);
    await expect(updateFundTxn(t, { amount: 400_001, date: D })).rejects.toBeInstanceOf(FundInputError);
    expect(fundPosition(await loadFundData(), 'f1').held).toBe(0);
  });

  it('updateFundTxn (thanh toán cá nhân): không vượt số quỹ còn nợ của khoản gốc', async () => {
    await seed(withCash(1_000_000));
    const e = (await saveFundExpense({ fundId: 'f1', title: 'Cá nhân ứng', date: D, amount: 300_000, mode: 'personal', payer: 'A' })) as string;
    const t = await saveFundTxn({ kind: 'payout', expenseId: e, amount: 100_000, date: D });
    expect(await updateFundTxn(t, { amount: 300_000, date: D })).toBe(true);
    await expect(updateFundTxn(t, { amount: 300_001, date: D })).rejects.toBeInstanceOf(FundInputError);
    expect((await raw()).fundTxns).toHaveLength(1);
    expect(await updateFundTxn('khong-co', { amount: 1, date: D })).toBe(false);
  });
});
