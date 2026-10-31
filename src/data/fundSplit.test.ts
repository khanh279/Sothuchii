import AsyncStorage from '@react-native-async-storage/async-storage';

import { FundInputError, deleteFundExpense, loadFundData, saveFundExpense, saveFundTxn } from './fundRepository';
import { fundPosition, personalDebt } from '@/domain/fundAdvance';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG.
const KEY = 'quy_nhom_v1';
const raw = async () => JSON.parse((await AsyncStorage.getItem(KEY)) as string);
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
const D = '2025-10-05';
const spend = (amount: number, extra: Record<string, unknown> = {}) => saveFundExpense({ fundId: 'f1', title: 'Mua vật tư', date: D, amount, ...extra });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('chi vượt số dư: chia nguồn tiền quỹ / cá nhân ứng', () => {
  it('1. quỹ 0 đồng: cá nhân ứng toàn bộ (không chia), quỹ nợ đủ số tiền', async () => {
    await seed(0);
    const id = (await spend(350_000, { mode: 'personal', payer: 'B' })) as string;
    const stored = (await raw()).expenses[0];
    expect(stored).toMatchObject({ id, amount: 350_000, mode: 'personal', payer: 'B' });
    expect(stored).not.toHaveProperty('fundPart');
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: -350_000, owed: 350_000 });
  });

  it('2. quỹ 200.000 < khoản chi 350.000: một bản ghi 350.000 với phần quỹ 200.000; số còn lại −150.000, quỹ nợ 150.000', async () => {
    await seed(200_000);
    await spend(350_000, { mode: 'personal', payer: 'B', fundPart: 200_000 });
    const stored = await raw();
    expect(stored.expenses).toHaveLength(1);
    expect(stored.expenses[0]).toMatchObject({ amount: 350_000, mode: 'personal', payer: 'B', fundPart: 200_000 });
    const data = await loadFundData();
    expect(fundPosition(data, 'f1')).toMatchObject({ cash: -150_000, owed: 150_000, spent: 350_000 });
    expect(personalDebt(data, data.expenses[0])).toMatchObject({ amount: 150_000, remaining: 150_000 });
  });

  it('phần quỹ chi không bị chặn theo số còn lại của quỹ (số dư có thể âm)', async () => {
    await seed(200_000);
    await spend(100_000); // một khoản khác làm quỹ còn 100.000
    await spend(350_000, { mode: 'personal', payer: 'B', fundPart: 200_000 });
    expect((await raw()).expenses).toHaveLength(2);
    expect(fundPosition(await loadFundData(), 'f1').cash).toBe(200_000 - 100_000 - 350_000);
  });

  it('phần quỹ không hợp lệ (0, bằng hoặc lớn hơn tổng) bị từ chối', async () => {
    await seed(500_000);
    for (const fundPart of [0, 350_000, 400_000]) {
      await expect(spend(350_000, { mode: 'personal', payer: 'B', fundPart })).rejects.toBeInstanceOf(FundInputError);
    }
    expect((await raw()).expenses).toEqual([]);
  });

  it('3. quỹ đúng bằng khoản chi: chi trực tiếp được, quỹ về 0, không có công nợ', async () => {
    await seed(350_000);
    await spend(350_000);
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 0, owed: 0, spent: 350_000 });
  });

  it('4. quỹ lớn hơn khoản chi: chi trực tiếp như cũ, không có fundPart', async () => {
    await seed(500_000);
    await spend(350_000);
    expect((await raw()).expenses[0]).not.toHaveProperty('fundPart');
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 150_000, owed: 0 });
  });

  it('gửi hai lần cùng clientId chỉ ghi MỘT khoản chia', async () => {
    await seed(200_000);
    const input = { mode: 'personal' as const, payer: 'B', fundPart: 200_000, clientId: 'cid-split' };
    await Promise.all([spend(350_000, input), spend(350_000, input)]);
    expect((await raw()).expenses).toHaveLength(1);
  });
});

describe('5. sửa và xoá khoản đã chia nguồn tiền', () => {
  const create = async () => {
    await seed(500_000); // sau khoản chia số còn lại là 150.000
    return (await spend(350_000, { mode: 'personal', payer: 'B', fundPart: 200_000 })) as string;
  };

  it('sửa nội dung / ngày giữ nguyên phần quỹ và công nợ; tăng tổng làm tăng phần cá nhân ứng; không tạo bản ghi mới', async () => {
    const id = await create();
    await saveFundExpense({ id, fundId: 'f1', title: 'Đổi tên', date: '2025-10-06', amount: 350_000 });
    await saveFundExpense({ id, fundId: 'f1', title: 'Đổi tên', date: '2025-10-06', amount: 400_000 });
    const stored = await raw();
    expect(stored.expenses).toHaveLength(1);
    expect(stored.expenses[0]).toMatchObject({ id, title: 'Đổi tên', amount: 400_000, fundPart: 200_000, mode: 'personal', payer: 'B' });
    expect(fundPosition(await loadFundData(), 'f1')).toMatchObject({ cash: 100_000, owed: 200_000, spent: 400_000 });
  });

  it('không cho giảm tổng xuống dưới phần quỹ đã chi cộng số quỹ đã trả cho cá nhân', async () => {
    const id = await create();
    await expect(saveFundExpense({ id, fundId: 'f1', title: 'x', date: D, amount: 200_000 })).rejects.toBeInstanceOf(FundInputError);
    await saveFundTxn({ kind: 'payout', expenseId: id, amount: 100_000, date: D });
    await expect(saveFundExpense({ id, fundId: 'f1', title: 'x', date: D, amount: 299_999 })).rejects.toBeInstanceOf(FundInputError);
    await saveFundExpense({ id, fundId: 'f1', title: 'x', date: D, amount: 300_000 }); // 200.000 quỹ + 100.000 đã trả
    expect((await raw()).expenses[0]).toMatchObject({ amount: 300_000, fundPart: 200_000 });
  });

  it('xoá khoản chưa thanh toán: mất cả hai phần, tiền thực tế quỹ trở lại 500.000, không còn công nợ hay bản ghi mồ côi', async () => {
    const id = await create();
    expect(await deleteFundExpense(id)).toBe(true);
    const data = await loadFundData();
    expect((await raw()).expenses).toEqual([]);
    expect(fundPosition(data, 'f1')).toMatchObject({ cash: 500_000, owed: 0, spent: 0 });
  });

  it('khoản đã có thanh toán thì không xoá được (phải xoá thanh toán trước), dữ liệu giữ nguyên', async () => {
    const id = await create();
    await saveFundTxn({ kind: 'payout', expenseId: id, amount: 50_000, date: D });
    await expect(deleteFundExpense(id)).rejects.toBeInstanceOf(FundInputError);
    expect((await raw()).expenses).toHaveLength(1);
  });
});
