import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FundInputError,
  createFund,
  deleteContribution,
  deleteFund,
  deleteFundExpense,
  loadFundData,
  renameFund,
  saveContribution,
  saveFundExpense,
  setContributionLinks,
} from './fundRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const KEY = 'quy_nhom_v1';
const raw = async () => JSON.parse((await AsyncStorage.getItem(KEY)) as string);
const seed = (value: unknown) => AsyncStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value));
const person = (name: string, amount: number) => ({ name, amount });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('đọc', () => {
  it('chưa có dữ liệu → dữ liệu trống, không tự tạo khóa', async () => {
    expect(await loadFundData()).toEqual({ funds: [], contribs: [], expenses: [], cur: '' });
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('JSON hỏng → ném StorageCorruptError và không ghi đè', async () => {
    await seed('{hong');
    await expect(loadFundData()).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(createFund('Quỹ mới')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(KEY)).toBe('{hong');
  });

  it('dữ liệu không phải đối tượng, hoặc danh sách không phải mảng → coi là hỏng, không ghi đè', async () => {
    await seed('[1,2]');
    await expect(createFund('A')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(KEY)).toBe('[1,2]');
    await seed({ funds: [], contribs: 'rac', expenses: [] });
    await expect(createFund('A')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await raw()).toEqual({ funds: [], contribs: 'rac', expenses: [] });
  });
});

describe('quỹ', () => {
  it('tạo quỹ đầu tiên ghi đủ ba mảng để PWA đọc được', async () => {
    const fund = await createFund('  Quỹ ăn trưa  ', 1_700_000_000_000);
    expect(fund.name).toBe('Quỹ ăn trưa');
    expect(fund.id.startsWith('f_')).toBe(true);
    expect(await raw()).toEqual({ funds: [fund], contribs: [], expenses: [] });
  });

  it('tên trống bị từ chối; tên dài bị cắt còn 40 ký tự', async () => {
    await expect(createFund('   ')).rejects.toBeInstanceOf(FundInputError);
    expect((await createFund('x'.repeat(60))).name).toHaveLength(40);
    expect((await raw()).funds).toHaveLength(1);
  });

  it('đổi tên giữ nguyên trường lạ của quỹ và các khóa lạ ngoài cùng', async () => {
    await seed({ funds: [{ id: 'f1', name: 'Cũ', color: 'đỏ' }, { id: 'f2', name: 'Khác' }], contribs: [], expenses: [], extra: { x: 1 } });
    expect(await renameFund('f1', ' Mới ')).toBe(true);
    expect(await raw()).toEqual({
      funds: [{ id: 'f1', name: 'Mới', color: 'đỏ' }, { id: 'f2', name: 'Khác' }],
      contribs: [],
      expenses: [],
      extra: { x: 1 },
    });
    expect(await renameFund('khong-co', 'A')).toBe(false);
    await expect(renameFund('f1', '')).rejects.toBeInstanceOf(FundInputError);
  });

  it('xoá quỹ kéo theo lần đóng và khoản chi của quỹ đó, không đụng quỹ khác', async () => {
    await seed({
      funds: [{ id: 'f1', name: 'A' }, { id: 'f2', name: 'B' }],
      contribs: [
        { id: 'c1', fundId: 'f1', title: '', date: '2025-10-01', people: [], exp: { m: '2025-10', id: 'x' } },
        { id: 'c2', fundId: 'f2', title: '', date: '2025-10-01', people: [] },
      ],
      expenses: [{ id: 'e1', fundId: 'f1' }, { id: 'e2', fundId: 'f2', note: 'giữ' }],
    });
    expect(await deleteFund('f1')).toBe(true);
    const data = await raw();
    expect(data.funds).toEqual([{ id: 'f2', name: 'B' }]);
    expect(data.contribs.map((c: { id: string }) => c.id)).toEqual(['c2']);
    expect(data.expenses).toEqual([{ id: 'e2', fundId: 'f2', note: 'giữ' }]);
    expect(await deleteFund('f1')).toBe(false);
  });

  it('lần đóng trỏ tới quỹ không tồn tại tính là của quỹ đầu tiên (như khi hiển thị)', async () => {
    await seed({
      funds: [{ id: 'f1', name: 'A' }, { id: 'f2', name: 'B' }],
      contribs: [{ id: 'c1', fundId: 'mat', title: '', date: '2025-10-01', people: [] }],
      expenses: [],
    });
    expect(await deleteFund('f2')).toBe(true);
    expect((await raw()).contribs).toHaveLength(1); // chưa mất khi xoá quỹ khác
    expect(await deleteFund('f1')).toBe(true);
    expect((await raw()).contribs).toEqual([]);
  });
});

describe('lần đóng quỹ', () => {
  beforeEach(async () => {
    await seed({ funds: [{ id: 'f1', name: 'A' }], contribs: [], expenses: [] });
  });

  it('thêm lần đóng: tiền lưu bằng ĐỒNG (50 nghìn = 50000)', async () => {
    const id = await saveContribution({ fundId: 'f1', title: 'T10', date: '2025-10-05', people: [person('Tôi', 50_000)] });
    expect(typeof id).toBe('string');
    expect((await raw()).contribs).toEqual([{ id, fundId: 'f1', title: 'T10', date: '2025-10-05', people: [{ name: 'Tôi', amount: 50_000 }] }]);
    expect((await loadFundData()).contribs[0].people[0].amount).toBe(50_000);
  });

  it('sửa giữ nguyên exp và trường lạ; chỉ đổi tiêu đề, ngày, người', async () => {
    await seed({
      funds: [{ id: 'f1', name: 'A' }],
      contribs: [{ id: 'c1', fundId: 'f1', title: 'cũ', date: '2025-10-01', people: [], exp: { m: '2025-10', id: 'x' }, ghiChu: 'giữ' }],
      expenses: [],
    });
    expect(await saveContribution({ id: 'c1', fundId: 'f1', title: 'mới', date: '2025-10-09', people: [person('An', 1000)] })).toBe('c1');
    expect((await raw()).contribs[0]).toEqual({
      id: 'c1',
      fundId: 'f1',
      title: 'mới',
      date: '2025-10-09',
      people: [{ name: 'An', amount: 1000 }],
      exp: { m: '2025-10', id: 'x' },
      ghiChu: 'giữ',
    });
  });

  it('sửa id không tồn tại → null, không ghi gì', async () => {
    expect(await saveContribution({ id: 'khong-co', fundId: 'f1', title: '', date: '2025-10-01', people: [] })).toBeNull();
    expect((await raw()).contribs).toEqual([]);
  });

  it('thiếu quỹ → FundInputError', async () => {
    await expect(saveContribution({ fundId: 'zzz', title: '', date: '2025-10-01', people: [] })).rejects.toBeInstanceOf(FundInputError);
  });

  it('xoá lần đóng chỉ xoá đúng lần đó', async () => {
    const a = (await saveContribution({ fundId: 'f1', title: 'a', date: '2025-10-01', people: [] })) as string;
    const b = (await saveContribution({ fundId: 'f1', title: 'b', date: '2025-10-02', people: [] }, 1)) as string;
    expect(await deleteContribution(a)).toBe(true);
    expect((await raw()).contribs.map((c: { id: string }) => c.id)).toEqual([b]);
    expect(await deleteContribution(a)).toBe(false);
  });
});

describe('khoản chi của quỹ', () => {
  beforeEach(async () => {
    await seed({ funds: [{ id: 'f1', name: 'A' }], contribs: [], expenses: [] });
  });

  it('chi quỹ nhập thẳng ĐỒNG, không nhân 1000', async () => {
    const id = await saveFundExpense({ fundId: 'f1', title: 'Mua nước', date: '2025-10-06', amount: 50_000 });
    expect((await raw()).expenses).toEqual([{ id, fundId: 'f1', title: 'Mua nước', date: '2025-10-06', amount: 50_000 }]);
  });

  it('số tiền ≤ 0 bị từ chối; sửa giữ trường lạ; xoá đúng khoản', async () => {
    await expect(saveFundExpense({ fundId: 'f1', title: 'x', date: '2025-10-06', amount: 0 })).rejects.toBeInstanceOf(FundInputError);
    await seed({ funds: [{ id: 'f1', name: 'A' }], contribs: [], expenses: [{ id: 'e1', fundId: 'f1', title: 'a', date: '2025-10-01', amount: 5, la: 1 }] });
    expect(await saveFundExpense({ id: 'e1', fundId: 'f1', title: 'b', date: '2025-10-02', amount: 7 })).toBe('e1');
    expect((await raw()).expenses).toEqual([{ id: 'e1', fundId: 'f1', title: 'b', date: '2025-10-02', amount: 7, la: 1 }]);
    expect(await deleteFundExpense('e1')).toBe(true);
    expect(await deleteFundExpense('e1')).toBe(false);
  });
});

describe('liên kết exp', () => {
  it('chỉ đổi trường exp của đúng lần đóng; bỏ liên kết thì xoá trường đó', async () => {
    await seed({
      funds: [{ id: 'f1', name: 'A' }],
      contribs: [
        { id: 'c1', fundId: 'f1', title: 't', date: '2025-10-01', people: [], la: 1 },
        { id: 'c2', fundId: 'f1', title: 't', date: '2025-10-01', people: [], exp: { m: '2025-10', id: 'old' } },
      ],
      expenses: [],
    });
    const written = await setContributionLinks([
      { contribId: 'c1', exp: { m: '2025-10', id: 'new' } },
      { contribId: 'c2', exp: null },
      { contribId: 'da-xoa', exp: { m: '2025-10', id: 'z' } },
    ]);
    expect(written).toBe(2);
    const { contribs } = await raw();
    expect(contribs[0]).toEqual({ id: 'c1', fundId: 'f1', title: 't', date: '2025-10-01', people: [], la: 1, exp: { m: '2025-10', id: 'new' } });
    expect(contribs[1]).not.toHaveProperty('exp');
  });
});

describe('an toàn khi ghi', () => {
  it('các thao tác gọi dồn không đè nhau', async () => {
    await seed({ funds: [{ id: 'f1', name: 'A' }], contribs: [], expenses: [] });
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) => saveContribution({ fundId: 'f1', title: `t${n}`, date: '2025-10-01', people: [] }, n)),
    );
    expect((await raw()).contribs).toHaveLength(5);
  });

  it('ghi lỗi → ném lỗi, kho giữ nguyên, hàng đợi vẫn chạy tiếp', async () => {
    await seed({ funds: [{ id: 'f1', name: 'A' }], contribs: [], expenses: [] });
    const before = await AsyncStorage.getItem(KEY);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('day bo nho'));
    await expect(renameFund('f1', 'B')).rejects.toThrow('day bo nho');
    expect(await AsyncStorage.getItem(KEY)).toBe(before);
    expect(await renameFund('f1', 'C')).toBe(true);
  });

  it('thao tác không đổi gì thì không ghi và không tạo khóa', async () => {
    expect(await renameFund('khong-co', 'A')).toBe(false);
    expect(await deleteContribution('khong-co')).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
