import AsyncStorage from '@react-native-async-storage/async-storage';

import { BillInputError, deleteBill, loadBillNames, loadBills, newBillId, saveBill, saveBillNames, setBillLinks } from './billRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền của bill là NGHÌN đồng.
const KEY = 'chiabill:v2:bills';
const raw = async (key = KEY) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const seed = (value: unknown, key = KEY) => AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const p = (name: string, paid: number, extra: { w?: number; fix?: number } = {}) => ({ name, paid, ...extra });
const three = [p('Tôi', 100), p('B', 0), p('C', 0)];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('đọc', () => {
  it('chưa có dữ liệu → rỗng, không tự tạo khóa', async () => {
    expect(await loadBills()).toEqual([]);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('JSON hỏng hoặc không phải mảng → ném StorageCorruptError và không ghi đè', async () => {
    await seed('{hong');
    await expect(loadBills()).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(saveBill({ title: 'x', people: three })).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(KEY)).toBe('{hong');
    await seed({ a: 1 });
    await expect(deleteBill('a')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await raw()).toEqual({ a: 1 });
  });
});

describe('thêm / sửa / xoá', () => {
  it('thêm bill: lưu đúng định dạng PWA, tiền giữ nguyên NGHÌN đồng', async () => {
    const id = (await saveBill({ title: '  Ăn trưa  ', date: '2025-10-05', cat: 'food', people: [p('Tôi', 100.5), p('B', 0, { w: 2 }), p('C', 0, { fix: 10 })] }, 1_700_000_000_000)) as string;
    expect(await raw()).toEqual([
      {
        id,
        title: 'Ăn trưa',
        date: '2025-10-05',
        cat: 'food',
        createdAt: 1_700_000_000_000,
        people: [{ name: 'Tôi', paid: 100.5, w: 1 }, { name: 'B', paid: 0, w: 2 }, { name: 'C', paid: 0, w: 1, fix: 10 }],
      },
    ]);
  });

  it('tiêu đề trống → "Không tên"; thiếu mục → "other"; thiếu ngày → hôm nay', async () => {
    await saveBill({ title: '   ', people: three });
    const [bill] = await loadBills();
    expect(bill).toMatchObject({ title: 'Không tên', cat: 'other' });
    expect(bill.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('bill không hợp lệ bị từ chối và không ghi gì', async () => {
    await expect(saveBill({ title: 'x', people: [p('Tôi', 0), p('B', 0)] })).rejects.toBeInstanceOf(BillInputError);
    await expect(saveBill({ title: 'x', people: [p('Tôi', 50)] })).rejects.toBeInstanceOf(BillInputError);
    await expect(saveBill({ title: 'x', people: [p('Tôi', 50, { fix: 40 }), p('B', 0, { fix: 30 })] })).rejects.toBeInstanceOf(BillInputError);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('sửa giữ nguyên id, createdAt, exp và trường lạ; chỉ đổi nội dung', async () => {
    await seed([
      { id: 'b1', title: 'Cũ', date: '2025-10-01', cat: 'fun', createdAt: 5, people: [p('Tôi', 1), p('B', 0)], exp: { m: '2025-10', id: 'x' }, ghiChu: 'giữ' },
      { id: 'b2', title: 'Khác', people: [] },
    ]);
    expect(await saveBill({ id: 'b1', title: 'Mới', date: '2025-10-09', cat: 'food', people: three })).toBe('b1');
    const bills = await raw();
    expect(bills[0]).toEqual({
      id: 'b1',
      title: 'Mới',
      date: '2025-10-09',
      cat: 'food',
      createdAt: 5,
      exp: { m: '2025-10', id: 'x' },
      ghiChu: 'giữ',
      people: [{ name: 'Tôi', paid: 100, w: 1 }, { name: 'B', paid: 0, w: 1 }, { name: 'C', paid: 0, w: 1 }],
    });
    expect(bills[1]).toEqual({ id: 'b2', title: 'Khác', people: [] });
  });

  it('sửa bill không tồn tại → null, không ghi gì', async () => {
    await seed([]);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    expect(await saveBill({ id: 'khong-co', title: 'x', people: three })).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('xoá đúng bill, giữ mục lạ; xoá bill không có thì không ghi', async () => {
    await seed([{ id: 'b1', people: [] }, 'rác', { id: 'b2', people: [] }]);
    expect(await deleteBill('b1')).toBe(true);
    expect(await raw()).toEqual(['rác', { id: 'b2', people: [] }]);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    expect(await deleteBill('b1')).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('mã bill: thời gian base36 + 5 ký tự', () => {
    expect(newBillId(36, () => 0.5)).toBe('10' + (0.5).toString(36).slice(2, 7));
  });
});

describe('liên kết exp', () => {
  it('chỉ đổi trường exp của đúng bill; bỏ liên kết thì xoá trường; bill đã xoá thì bỏ qua', async () => {
    await seed([
      { id: 'b1', title: 't', people: [], la: 1 },
      { id: 'b2', title: 't', people: [], exp: { m: '2025-10', id: 'old' } },
    ]);
    const written = await setBillLinks([
      { billId: 'b1', exp: { m: '2025-10', id: 'new' } },
      { billId: 'b2', exp: null },
      { billId: 'da-xoa', exp: { m: '2025-10', id: 'z' } },
    ]);
    expect(written).toBe(2);
    const bills = await raw();
    expect(bills[0]).toEqual({ id: 'b1', title: 't', people: [], la: 1, exp: { m: '2025-10', id: 'new' } });
    expect(bills[1]).not.toHaveProperty('exp');
  });
});

describe('nhóm người và an toàn khi ghi', () => {
  it('lưu / đọc nhóm người (cắt khoảng trắng)', async () => {
    expect(await loadBillNames()).toEqual([]);
    await saveBillNames([' Tôi ', 'An ']);
    expect(await raw('chiabill:names')).toEqual(['Tôi', 'An']);
    expect(await loadBillNames()).toEqual(['Tôi', 'An']);
  });

  it('các thao tác gọi dồn không đè nhau', async () => {
    await seed([]);
    await Promise.all([1, 2, 3, 4, 5].map((n) => saveBill({ title: `t${n}`, people: three }, n)));
    expect(await raw()).toHaveLength(5);
  });

  it('ghi lỗi → ném lỗi, kho giữ nguyên, hàng đợi chạy tiếp', async () => {
    await seed([{ id: 'b1', title: 'a', people: [] }]);
    const before = await AsyncStorage.getItem(KEY);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('day bo nho'));
    await expect(deleteBill('b1')).rejects.toThrow('day bo nho');
    expect(await AsyncStorage.getItem(KEY)).toBe(before);
    expect(await deleteBill('b1')).toBe(true);
  });
});
