import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadBills } from './billRepository';
import { ensureVndUnits } from './moneyMigration';
import { loadPays } from './payRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Dữ liệu cũ lưu NGHÌN đồng.
const BILLS = 'chiabill:v2:bills';
const PAYS = 'chiabill:v2:pays';
const MARK = 'chiabill:unit';
const set = (key: string, value: unknown) => AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const raw = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const oldBills = [
  {
    id: 'b1',
    title: 'Ăn',
    date: '2025-10-01',
    cat: 'food',
    createdAt: 1,
    people: [
      { name: 'Tôi', paid: 120, w: 1 },
      { name: 'An', paid: 0, w: 2, fix: 1.5 },
    ],
    la: 'giữ',
  },
];
const oldPays = [{ id: 'p1', createdAt: 2, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 30.5, kind: 'billpay', zz: 1 }, 'mục lạ'];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('chuyển nghìn đồng -> đồng', () => {
  it('nhân 1000 cho tiền của bill và khoản trả, giữ nguyên trường lạ, đặt dấu hiệu', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, oldPays);
    await ensureVndUnits();
    expect(await raw(BILLS)).toEqual([
      {
        ...oldBills[0],
        people: [
          { name: 'Tôi', paid: 120_000, w: 1 },
          { name: 'An', paid: 0, w: 2, fix: 1500 },
        ],
      },
    ]);
    expect(await raw(PAYS)).toEqual([{ ...(oldPays[0] as object), amt: 30_500 }, 'mục lạ']);
    expect(await AsyncStorage.getItem(MARK)).toBe('vnd');
  });

  it('giữ nguyên văn bản gốc (nghìn đồng) ở hai khóa dự phòng', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, oldPays);
    const [b, p] = [await AsyncStorage.getItem(BILLS), await AsyncStorage.getItem(PAYS)];
    await ensureVndUnits();
    expect(await AsyncStorage.getItem('chiabill:v2:bills:nghin-backup')).toBe(b);
    expect(await AsyncStorage.getItem('chiabill:v2:pays:nghin-backup')).toBe(p);
  });

  it('chỉ chạy MỘT lần: gọi lại hoặc gọi dồn không nhân thêm', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, oldPays);
    await Promise.all([ensureVndUnits(), ensureVndUnits(), ensureVndUnits()]);
    await ensureVndUnits();
    expect((await raw(PAYS))[0].amt).toBe(30_500);
    expect((await raw(BILLS))[0].people[0].paid).toBe(120_000);
  });

  it('các hàm đọc tự chuyển trước khi trả dữ liệu', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, oldPays);
    expect((await loadBills())[0].people[0].paid).toBe(120_000);
    expect((await loadPays())[0].amt).toBe(30_500);
  });

  it('đã có dấu hiệu "vnd" thì KHÔNG đụng vào dữ liệu (đã là đồng)', async () => {
    await set(MARK, 'vnd');
    await set(BILLS, [{ ...oldBills[0], people: [{ name: 'Tôi', paid: 120_000, w: 1 }] }]);
    await set(PAYS, [{ id: 'p', amt: 30_500 }]);
    await ensureVndUnits();
    expect((await raw(BILLS))[0].people[0].paid).toBe(120_000);
    expect((await raw(PAYS))[0].amt).toBe(30_500);
    expect(await AsyncStorage.getItem('chiabill:v2:bills:nghin-backup')).toBeNull();
  });

  it('chỉ có bill (chưa có khoản trả) hoặc ngược lại vẫn chuyển được phần có dữ liệu', async () => {
    await set(PAYS, oldPays);
    await ensureVndUnits();
    expect((await raw(PAYS))[0].amt).toBe(30_500);
    expect(await AsyncStorage.getItem(BILLS)).toBeNull();
  });

  it('máy mới (không có dữ liệu): chỉ đặt dấu hiệu, không tạo bills / pays', async () => {
    await ensureVndUnits();
    expect(await AsyncStorage.getItem(MARK)).toBe('vnd');
    expect(await AsyncStorage.getItem(BILLS)).toBeNull();
    expect(await AsyncStorage.getItem(PAYS)).toBeNull();
  });

  it('markEmpty: false và chưa có dữ liệu → không ghi gì (thao tác chỉ đọc)', async () => {
    await ensureVndUnits({ markEmpty: false });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('dữ liệu hỏng → ném StorageCorruptError và KHÔNG ghi gì (không dấu hiệu, không dự phòng, không sửa)', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, '[hong');
    await expect(ensureVndUnits()).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(MARK)).toBeNull();
    expect(await AsyncStorage.getItem('chiabill:v2:bills:nghin-backup')).toBeNull();
    expect(await raw(BILLS)).toEqual(oldBills);
    expect(await AsyncStorage.getItem(PAYS)).toBe('[hong');
    await set(PAYS, { a: 1 });
    await expect(ensureVndUnits()).rejects.toBeInstanceOf(StorageCorruptError);
  });

  it('ghi lỗi giữa chừng → dữ liệu gốc giữ nguyên, lần sau thử lại được', async () => {
    await set(BILLS, oldBills);
    await set(PAYS, oldPays);
    (AsyncStorage.multiSet as jest.Mock).mockRejectedValueOnce(new Error('day bo nho'));
    await expect(ensureVndUnits()).rejects.toThrow('day bo nho');
    expect(await raw(BILLS)).toEqual(oldBills);
    expect(await AsyncStorage.getItem(MARK)).toBeNull();
    await ensureVndUnits();
    expect((await raw(PAYS))[0].amt).toBe(30_500);
  });

  it('không giữ lại bản dự phòng cũ khi đã có: không ghi đè bản gốc đầu tiên', async () => {
    await set('chiabill:v2:bills:nghin-backup', '"cu"');
    await set(BILLS, oldBills);
    await ensureVndUnits();
    expect(await AsyncStorage.getItem('chiabill:v2:bills:nghin-backup')).toBe('"cu"');
  });
});
