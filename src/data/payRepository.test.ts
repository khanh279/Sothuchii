import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PayInputError,
  appendPays,
  deletePayGroup,
  deletePays,
  loadPays,
  replacePayGroup,
  setPayLinks,
  setPayNotes,
  updatePay,
} from './payRepository';
import { StorageCorruptError } from './storage';
import type { Pay } from '@/types/pay';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const KEY = 'chiabill:v2:pays';
const raw = async () => JSON.parse((await AsyncStorage.getItem(KEY)) as string);
const seed = (value: unknown) => AsyncStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value));
const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, createdAt: 1, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 10_000, kind: 'vay', ...over });
const pay = (id: string, over: Partial<Pay> = {}): Pay => rec(id, over) as Pay;

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('chiabill:unit', 'vnd'); // dữ liệu mẫu đã ở đơn vị đồng
});

describe('đọc', () => {
  it('chưa có dữ liệu → rỗng, không tự tạo khóa', async () => {
    expect(await loadPays()).toEqual([]);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('JSON hỏng hoặc không phải mảng → ném StorageCorruptError và không ghi đè', async () => {
    await seed('{hong');
    await expect(loadPays()).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(appendPays([pay('x')])).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(KEY)).toBe('{hong');
    await seed({ a: 1 });
    await expect(deletePays(['a'])).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await raw()).toEqual({ a: 1 });
  });
});

describe('thêm', () => {
  it('lưu đúng định dạng PWA, tiền giữ nguyên ĐỒNG và làm tròn từng đồng', async () => {
    await appendPays([pay('a', { amt: 12345.6, note: 'ăn' })]);
    expect(await raw()).toEqual([{ id: 'a', createdAt: 1, date: '2025-10-05', note: 'ăn', from: 'Tôi', to: 'An', amt: 12_346, kind: 'vay' }]);
  });

  it('khoản không hợp lệ bị từ chối và không ghi gì (cả lô)', async () => {
    for (const bad of [pay('a', { amt: 0 }), pay('a', { amt: NaN }), pay('a', { amt: 0.4 }), pay('a', { from: ' ' }), pay('a', { to: '' }), pay('', {}), pay('a', { date: 'sai' })]) {
      await expect(appendPays([pay('ok'), bad])).rejects.toBeInstanceOf(PayInputError);
    }
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('khoản mới giống hệt khoản đã có giữa hai người KHÁC "Tôi" → CỘNG vào khoản đó; trường lạ và mục lạ giữ nguyên', async () => {
    const others = { from: 'An', to: 'Bình' };
    await seed([rec('a', { ...others, amt: 10_000, extra: 'giữ', nexp: [{ m: '2025-10', id: 'old' }], exp: [{ m: '2025-10', id: 'x' }] }), 'rác']);
    await appendPays([pay('b', { ...others, amt: 5000 })]);
    const list = await raw();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(rec('a', { ...others, amt: 15_000, extra: 'giữ', nexp: [{ m: '2025-10', id: 'old' }], exp: [{ m: '2025-10', id: 'x' }] }));
    expect(list[1]).toBe('rác');
  });

  it('khoản có "Tôi" (tôi chuyển / trả, người khác chuyển / trả tôi) giống hệt nhau thì KHÔNG bị gộp: mỗi lần ghi là một dòng, tiền không cộng', async () => {
    await seed([rec('a', { amt: 10_000 }), rec('x', { from: 'An', to: 'Tôi', amt: 7000 })]);
    await appendPays([pay('b', { amt: 5000 }), pay('y', { from: 'An', to: 'Tôi', amt: 3000 })]);
    expect((await raw()).map((x: { id: string; amt: number }) => [x.id, x.amt])).toEqual([['a', 10_000], ['x', 7000], ['b', 5000], ['y', 3000]]);
  });

  it('khoản khác ngày / loại / ghi chú thì không gộp; khoản nhiều bill (bills) không bao giờ gộp', async () => {
    await seed([rec('a')]);
    await appendPays([pay('b', { date: '2025-10-06' }), pay('c', { note: 'khác' }), pay('d', { kind: 'billpay' })]);
    expect((await raw()).map((x: { id: string }) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    await seed([rec('a', { bills: ['x'], kind: 'repay' })]);
    await appendPays([pay('b', { bills: ['x'], kind: 'repay' })]);
    expect(await raw()).toHaveLength(2);
  });

  it('thêm danh sách rỗng không ghi gì', async () => {
    (AsyncStorage.setItem as jest.Mock).mockClear();
    await appendPays([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('không gộp khi ĐỌC: dữ liệu đã có hai khoản trùng vẫn nguyên khi chỉ đọc / xoá khoản khác', async () => {
    await seed([rec('a'), rec('b'), rec('c', { to: 'Bình' })]);
    expect(await loadPays()).toHaveLength(3);
    await deletePays(['c']);
    expect(await raw()).toHaveLength(2);
  });
});

describe('sửa', () => {
  const patch = { date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 10_000 };

  it('giữ id, createdAt, exp, loại và trường lạ; chỉ đổi các trường được sửa', async () => {
    await seed([rec('a', { exp: [{ m: '2025-10', id: 'x' }], la: 1, kind: 'billpay' })]);
    expect(await updatePay('a', { ...patch, date: '2025-10-07', note: 'mới', to: 'Bình', amt: 7000.4 })).toBe(true);
    expect((await raw())[0]).toEqual(rec('a', { exp: [{ m: '2025-10', id: 'x' }], la: 1, kind: 'billpay', date: '2025-10-07', note: 'mới', to: 'Bình', amt: 7000 }));
  });

  it('sửa thành giống hệt một khoản khác KHÔNG gộp: tiền hai khoản giữ nguyên, không cộng hai lần', async () => {
    await seed([rec('a', { amt: 10_000 }), rec('b', { amt: 4000, note: 'khác' })]);
    expect(await updatePay('b', { ...patch, amt: 4000 })).toBe(true); // b giờ giống hệt a về khóa
    expect((await raw()).map((x: { id: string; amt: number }) => [x.id, x.amt])).toEqual([['a', 10_000], ['b', 4000]]);
    expect(await updatePay('a', { ...patch, amt: 10_000 })).toBe(true); // sửa a mà không đổi gì
    expect((await raw()).map((x: { id: string; amt: number }) => [x.id, x.amt])).toEqual([['a', 10_000], ['b', 4000]]);
  });

  it('khoản không được sửa vẫn được gộp như PWA khi hai khoản giữa hai người khác "Tôi" trùng nhau', async () => {
    const others = { from: 'An', to: 'Bình' };
    await seed([rec('a', { amt: 10_000 }), rec('b', { ...others, amt: 4000, note: 'khác' }), rec('c', { ...others, amt: 3000, note: 'khác' })]);
    await updatePay('a', { ...patch, amt: 10_000 });
    expect((await raw()).map((x: { id: string; amt: number }) => [x.id, x.amt])).toEqual([['a', 10_000], ['b', 7000]]);
  });

  it('đổi loại chủ động: đổi kind và bỏ cờ ds; khoản gắn với bill thì giữ loại', async () => {
    await seed([rec('a', { kind: 'vay', ds: 1 }), rec('b', { kind: 'bill', bill: 'b1', ds: 1 })]);
    await updatePay('a', { ...patch, kind: 'billpay' });
    await updatePay('b', { ...patch, kind: 'vay' });
    const list = await raw();
    expect(list[0]).toMatchObject({ kind: 'billpay' });
    expect(list[0]).not.toHaveProperty('ds');
    expect(list[1]).toMatchObject({ kind: 'bill', ds: 1 });
  });

  it('không tìm thấy → false, không ghi; dữ liệu sai bị từ chối', async () => {
    await seed([rec('a')]);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    expect(await updatePay('khong-co', patch)).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    await expect(updatePay('a', { ...patch, amt: 0 })).rejects.toBeInstanceOf(PayInputError);
    await expect(updatePay('a', { ...patch, from: '' })).rejects.toBeInstanceOf(PayInputError);
    await expect(updatePay('a', { ...patch, date: '' })).rejects.toBeInstanceOf(PayInputError);
    expect((await raw())[0]).toEqual(rec('a'));
  });

  it('thay cả nhóm bằng một khoản; đổi ghi chú hàng loạt', async () => {
    await seed([rec('a', { bills: ['x'], kind: 'billpay' }), rec('b', { bills: ['y'], kind: 'billpay' }), rec('c', { to: 'Bình' })]);
    expect(await replacePayGroup(['a', 'b'], pay('n', { amt: 30_000, kind: 'repay', bills: ['x', 'y'], lbl: 'Thanh toán bill' }))).toBe(true);
    expect((await raw()).map((x: { id: string }) => x.id)).toEqual(['c', 'n']);
    expect(await replacePayGroup(['khong-co'], pay('z'))).toBe(false);
    expect(await setPayNotes(['c', 'n'], 'ghi chú')).toBe(2);
    expect((await raw()).every((x: { note: string }) => x.note === 'ghi chú')).toBe(true);
    expect(await setPayNotes(['khong-co'], 'x')).toBe(0);
  });
});

describe('xoá và hoàn tác', () => {
  it('xoá theo mã, giữ mục lạ; xoá khoản không có thì không ghi', async () => {
    await seed([rec('a'), 'rác', rec('b')]);
    expect(await deletePays(['a'])).toBe(1);
    expect(await raw()).toEqual(['rác', rec('b')]);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    expect(await deletePays(['a'])).toBe(0);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('hoàn tác gộp nợ: bỏ đúng các khoản cùng nhóm', async () => {
    await seed([rec('a', { kind: 'bt', grp: 'g1' }), rec('b', { kind: 'bt', grp: 'g1' }), rec('c', { kind: 'bt', grp: 'g2' }), rec('d')]);
    expect(await deletePayGroup('g1')).toBe(2);
    expect((await raw()).map((x: { id: string }) => x.id)).toEqual(['c', 'd']);
    expect(await deletePayGroup('g9')).toBe(0);
  });
});

describe('liên kết exp', () => {
  it('ghi mảng exp; rỗng / null thì xoá trường; khoản đã xoá bỏ qua; trường lạ giữ nguyên', async () => {
    await seed([rec('a', { la: 1 }), rec('b', { exp: [{ m: '2025-10', id: 'old' }] })]);
    const written = await setPayLinks([
      { payId: 'a', exp: [{ m: '2025-10', id: 'n1' }, { m: '2025-10', id: 'n2' }] },
      { payId: 'b', exp: null },
      { payId: 'da-xoa', exp: [{ m: '2025-10', id: 'z' }] },
    ]);
    expect(written).toBe(2);
    const list = await raw();
    expect(list[0]).toEqual(rec('a', { la: 1, exp: [{ m: '2025-10', id: 'n1' }, { m: '2025-10', id: 'n2' }] }));
    expect(list[1]).not.toHaveProperty('exp');
    await setPayLinks([{ payId: 'a', exp: [] }]);
    expect((await raw())[0]).not.toHaveProperty('exp');
  });
});

describe('an toàn khi ghi', () => {
  it('thao tác gọi dồn không đè nhau', async () => {
    await seed([]);
    await Promise.all([1, 2, 3, 4, 5].map((n) => appendPays([pay(`p${n}`, { date: `2025-10-0${n}` })])));
    expect(await raw()).toHaveLength(5);
  });

  it('ghi lỗi → ném lỗi, kho giữ nguyên, hàng đợi chạy tiếp', async () => {
    await seed([rec('a')]);
    const before = await AsyncStorage.getItem(KEY);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('day bo nho'));
    await expect(deletePays(['a'])).rejects.toThrow('day bo nho');
    expect(await AsyncStorage.getItem(KEY)).toBe(before);
    expect(await deletePays(['a'])).toBe(1);
  });
});
