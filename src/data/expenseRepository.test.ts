import AsyncStorage from '@react-native-async-storage/async-storage';

import { ExpenseInputError, addExp, delExp, getExp, listSrc } from './expenseApi';
import {
  ExpenseIdExistsError,
  createExpense,
  deleteExpense,
  getExpense,
  listMonthKeys,
  loadMonth,
  loadMonths,
  loadSettings,
  saveSettings,
  updateExpense,
} from './expenseRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const exp = (over: Record<string, unknown> = {}) => ({ a: 50000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1000, ...over });
const asMock = (name: 'setItem' | 'multiSet') => AsyncStorage[name] as unknown as jest.Mock;
const raw = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);

beforeEach(async () => {
  await AsyncStorage.clear();
  asMock('setItem').mockClear();
  asMock('multiSet').mockClear();
});

describe('đọc / thêm / xoá', () => {
  it('thêm rồi đọc lại theo tháng', async () => {
    const ref = await createExpense('abc1', exp());
    expect(ref).toEqual({ m: '2025-10', id: 'abc1' });
    expect(await loadMonth('2025-10')).toEqual([{ id: 'abc1', ...exp() }]);
    expect(await getExpense(ref)).toMatchObject({ id: 'abc1', a: 50000 });
    expect(await loadMonth('2025-09')).toEqual([]);
    expect(await getExpense({ m: '2025-10', id: 'khong-co' })).toBeNull();
  });

  it('lưu đúng định dạng PWA: khóa sct:m:YYYY-MM -> { id: bản ghi }', async () => {
    await createExpense('x1', exp({ i: 'chi tiết', src: 'quy' }));
    expect(await raw('sct:m:2025-10')).toEqual({ x1: exp({ i: 'chi tiết', src: 'quy' }) });
  });

  it('loadMonths gộp nhiều tháng; listMonthKeys chỉ lấy khóa tháng hợp lệ, có sắp xếp', async () => {
    await createExpense('a', exp({ d: '2025-10-01' }));
    await createExpense('b', exp({ d: '2025-03-01' }));
    await AsyncStorage.setItem('sct:settings', '{}');
    await AsyncStorage.setItem('sct:m:abc', '{}');
    await AsyncStorage.setItem('sct:m:2025-1', '{}');
    await AsyncStorage.setItem('quy_nhom_v1', '{}');
    expect(await listMonthKeys()).toEqual(['2025-03', '2025-10']);
    expect((await loadMonths(['2025-03', '2025-10'])).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('xoá: trả true/false, khóa tháng được giữ lại dù rỗng', async () => {
    await createExpense('a', exp());
    expect(await deleteExpense({ m: '2025-10', id: 'a' })).toBe(true);
    expect(await deleteExpense({ m: '2025-10', id: 'a' })).toBe(false);
    expect(await deleteExpense({ m: '2030-01', id: 'a' })).toBe(false);
    expect(await raw('sct:m:2025-10')).toEqual({});
    expect(await listMonthKeys()).toEqual(['2025-10']);
  });

  it('view an toàn với bản ghi thiếu trường nhưng không sửa bản thô', async () => {
    await AsyncStorage.setItem('sct:m:2025-10', JSON.stringify({ m1: { a: 1000 } }));
    expect(await loadMonth('2025-10')).toEqual([{ id: 'm1', a: 1000, c: 'other', n: '', d: '2025-10-01', t: 0 }]);
    expect(await raw('sct:m:2025-10')).toEqual({ m1: { a: 1000 } });
  });
});

describe('ghi tuần tự, không mất cập nhật', () => {
  it('20 lần thêm đồng thời vào cùng một tháng đều còn đủ', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => 'id' + i);
    await Promise.all(ids.map((id, i) => createExpense(id, exp({ a: 1000 + i }))));
    const saved = await loadMonth('2025-10');
    expect(saved).toHaveLength(20);
    expect(new Set(saved.map((e) => e.id))).toEqual(new Set(ids));
  });

  it('thêm, sửa, xoá lẫn lộn đồng thời vẫn cho kết quả đúng theo thứ tự gọi', async () => {
    await createExpense('a', exp({ a: 1 }));
    await Promise.all([
      updateExpense({ m: '2025-10', id: 'a' }, { a: 2 }),
      createExpense('b', exp({ a: 10 })),
      updateExpense({ m: '2025-10', id: 'a' }, { a: 3 }),
      deleteExpense({ m: '2025-10', id: 'b' }),
      createExpense('c', exp({ a: 20 })),
    ]);
    const saved = await loadMonth('2025-10');
    expect(saved.map((e) => [e.id, e.a]).sort()).toEqual([
      ['a', 3],
      ['c', 20],
    ]);
  });

  it('không ghi đè khoản chi cũ khi trùng id', async () => {
    await createExpense('a', exp({ a: 111 }));
    await expect(createExpense('a', exp({ a: 222 }))).rejects.toBeInstanceOf(ExpenseIdExistsError);
    expect((await loadMonth('2025-10'))[0].a).toBe(111);
  });

  it('một thao tác lỗi không làm tắc hàng đợi', async () => {
    asMock('setItem').mockRejectedValueOnce(new Error('đĩa đầy'));
    await expect(createExpense('a', exp())).rejects.toThrow('đĩa đầy');
    await createExpense('b', exp());
    expect((await loadMonth('2025-10')).map((e) => e.id)).toEqual(['b']);
  });
});

describe('sửa khoản chi', () => {
  it('giữ nguyên t, i, src và trường lạ; chỉ đổi trường trong patch', async () => {
    await createExpense('a', exp({ i: 'Chia bill 05/10', src: 'cb', t: 424242, extra: { x: 1 } }) as never);
    const ref = await updateExpense({ m: '2025-10', id: 'a' }, { a: 70000, n: 'Mới' });
    expect(ref).toEqual({ m: '2025-10', id: 'a' });
    expect((await raw('sct:m:2025-10')).a).toEqual({
      a: 70000,
      c: 'food',
      n: 'Mới',
      d: '2025-10-05',
      t: 424242,
      i: 'Chia bill 05/10',
      src: 'cb',
      extra: { x: 1 },
    });
  });

  it('patch có giá trị undefined không xoá dữ liệu cũ', async () => {
    await createExpense('a', exp());
    await updateExpense({ m: '2025-10', id: 'a' }, { n: undefined, a: 9 });
    expect((await raw('sct:m:2025-10')).a).toMatchObject({ n: 'Phở', a: 9 });
  });

  it('đổi sang tháng khác: chuyển cùng id, tháng cũ không còn, giữ t/src/i', async () => {
    await createExpense('a', exp({ src: 'quy', i: 'ghi chú', t: 7 }) as never);
    await createExpense('keep', exp());
    const ref = await updateExpense({ m: '2025-10', id: 'a' }, { d: '2025-09-30' });
    expect(ref).toEqual({ m: '2025-09', id: 'a' });
    expect(await raw('sct:m:2025-09')).toEqual({ a: exp({ d: '2025-09-30', src: 'quy', i: 'ghi chú', t: 7 }) });
    expect(Object.keys(await raw('sct:m:2025-10'))).toEqual(['keep']);
  });

  it('chuyển tháng ghi tháng mới trước tháng cũ, trong một lệnh multiSet', async () => {
    await createExpense('a', exp());
    asMock('multiSet').mockClear(); // setItem của mock gọi nội bộ multiSet nên phải xoá bộ đếm
    await updateExpense({ m: '2025-10', id: 'a' }, { d: '2025-08-01' });
    expect(asMock('multiSet')).toHaveBeenCalledTimes(1);
    const pairs = asMock('multiSet').mock.calls[0][0] as [string, string][];
    expect(pairs.map(([key]) => key)).toEqual(['sct:m:2025-08', 'sct:m:2025-10']);
  });

  it('chuyển tháng thất bại thì dữ liệu cũ còn nguyên, không mất', async () => {
    await createExpense('a', exp());
    asMock('multiSet').mockRejectedValueOnce(new Error('lỗi ghi'));
    await expect(updateExpense({ m: '2025-10', id: 'a' }, { d: '2025-08-01' })).rejects.toThrow('lỗi ghi');
    expect(await loadMonth('2025-10')).toHaveLength(1);
    expect(await loadMonth('2025-08')).toHaveLength(0);
    // thử lại thành công
    await updateExpense({ m: '2025-10', id: 'a' }, { d: '2025-08-01' });
    expect(await loadMonth('2025-08')).toHaveLength(1);
    expect(await loadMonth('2025-10')).toHaveLength(0);
  });

  it('chuyển vào tháng đã có khoản khác thì không đè các khoản đó', async () => {
    await createExpense('a', exp({ d: '2025-10-05' }));
    await createExpense('z', exp({ d: '2025-09-01', a: 5 }));
    await updateExpense({ m: '2025-10', id: 'a' }, { d: '2025-09-02' });
    expect((await loadMonth('2025-09')).map((e) => e.id).sort()).toEqual(['a', 'z']);
  });

  it('không tìm thấy thì trả null và không ghi gì', async () => {
    asMock('setItem').mockClear();
    expect(await updateExpense({ m: '2025-10', id: 'khong-co' }, { a: 1 })).toBeNull();
    expect(asMock('setItem')).not.toHaveBeenCalled();
  });
});

describe('dữ liệu hỏng / bản ghi lạ', () => {
  it('JSON hỏng: đọc ném StorageCorruptError và ghi KHÔNG đè lên dữ liệu hỏng', async () => {
    await AsyncStorage.setItem('sct:m:2025-10', '{khong phai json');
    await expect(loadMonth('2025-10')).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(createExpense('a', exp())).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(deleteExpense({ m: '2025-10', id: 'a' })).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem('sct:m:2025-10')).toBe('{khong phai json');
  });

  it('giá trị tháng không phải đối tượng cũng coi là hỏng', async () => {
    await AsyncStorage.setItem('sct:m:2025-10', '[1,2]');
    await expect(loadMonth('2025-10')).rejects.toBeInstanceOf(StorageCorruptError);
    await AsyncStorage.setItem('sct:m:2025-10', 'null');
    await expect(loadMonth('2025-10')).rejects.toBeInstanceOf(StorageCorruptError);
  });

  it('bản ghi không hiểu được bị ẩn khỏi danh sách nhưng được giữ nguyên khi ghi', async () => {
    const weird = { bad: { foo: 1 }, text: 'xyz', nul: null, good: exp() };
    await AsyncStorage.setItem('sct:m:2025-10', JSON.stringify(weird));
    expect((await loadMonth('2025-10')).map((e) => e.id)).toEqual(['good']);
    await createExpense('new', exp({ a: 7 }));
    expect(await raw('sct:m:2025-10')).toEqual({ ...weird, new: exp({ a: 7 }) });
  });
});

describe('cài đặt', () => {
  it('chưa có thì trả mặc định; lưu rồi đọc lại', async () => {
    expect(await loadSettings()).toEqual({ budget: 0, budgets: {}, cats: [] });
    const settings = { budget: 0, budgets: { '2025-10': 3_000_000 }, cats: [{ id: 'c1', name: 'A', icon: 'pet', color: '#fff' }] };
    await saveSettings(settings);
    expect(await loadSettings()).toEqual(settings);
  });

  it('giữ nguyên trường lạ trong bản lưu cũ', async () => {
    await AsyncStorage.setItem('sct:settings', JSON.stringify({ budget: 5, budgets: {}, cats: [], future: 'giu-lai' }));
    await saveSettings({ budget: 5, budgets: { '2025-10': 1 }, cats: [] });
    expect(await raw('sct:settings')).toEqual({ budget: 5, budgets: { '2025-10': 1 }, cats: [], future: 'giu-lai' });
  });

  it('cài đặt hỏng: đọc ném lỗi, ghi không đè', async () => {
    await AsyncStorage.setItem('sct:settings', '{hong');
    await expect(loadSettings()).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(saveSettings({ budget: 0, budgets: {}, cats: [] })).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem('sct:settings')).toBe('{hong');
  });
});

describe('hợp đồng addExp / getExp / delExp / listSrc', () => {
  it('addExp: làm tròn, cắt n/i, gắn t và src, trả về { m, id }', async () => {
    const ref = await addExp({ a: 1234.6, c: 'fund', n: 'x'.repeat(100), i: 'y'.repeat(200), d: '2025-10-05', src: 'quy' }, 5555);
    expect(ref.m).toBe('2025-10');
    const stored = await getExp(ref);
    expect(stored).toEqual({ a: 1235, c: 'fund', n: 'x'.repeat(80), i: 'y'.repeat(120), d: '2025-10-05', t: 5555, src: 'quy' });
    expect(stored).not.toHaveProperty('id');
  });

  it('addExp: không có n/i thì lưu chuỗi rỗng như PWA', async () => {
    const ref = await addExp({ a: 1000, c: 'bill', d: '2025-10-05', src: 'cb' });
    expect(await getExp(ref)).toMatchObject({ n: '', i: '', src: 'cb' });
  });

  it('addExp từ chối số tiền / ngày sai và không ghi gì', async () => {
    await expect(addExp({ a: 0, c: 'x', d: '2025-10-05', src: 'cb' })).rejects.toBeInstanceOf(ExpenseInputError);
    await expect(addExp({ a: 0.4, c: 'x', d: '2025-10-05', src: 'cb' })).rejects.toBeInstanceOf(ExpenseInputError);
    await expect(addExp({ a: -5, c: 'x', d: '2025-10-05', src: 'cb' })).rejects.toBeInstanceOf(ExpenseInputError);
    await expect(addExp({ a: NaN, c: 'x', d: '2025-10-05', src: 'cb' })).rejects.toBeInstanceOf(ExpenseInputError);
    await expect(addExp({ a: 5, c: 'x', d: '2025-02-30', src: 'cb' })).rejects.toBeInstanceOf(ExpenseInputError);
    expect(await listMonthKeys()).toEqual([]);
  });

  it('id sinh ra không trùng khi thêm liên tiếp cùng một mốc thời gian', async () => {
    const refs = await Promise.all(Array.from({ length: 50 }, () => addExp({ a: 1, c: 'x', d: '2025-10-05', src: 'cb' }, 99)));
    expect(new Set(refs.map((r) => r.id)).size).toBe(50);
    expect(await loadMonth('2025-10')).toHaveLength(50);
  });

  it('delExp an toàn với ref trống / đã xoá', async () => {
    const ref = await addExp({ a: 1000, c: 'bill', d: '2025-10-05', src: 'cb' });
    expect(await delExp(ref)).toBe(true);
    expect(await delExp(ref)).toBe(false);
    expect(await delExp(null)).toBe(false);
    expect(await delExp(undefined)).toBe(false);
    expect(await getExp(ref)).toBeNull();
    expect(await getExp(null)).toBeNull();
  });

  it('listSrc liệt kê theo nguồn trên mọi tháng, bỏ qua khoản người dùng tự nhập', async () => {
    const a = await addExp({ a: 1000, c: 'fund', d: '2025-10-05', src: 'quy' });
    const b = await addExp({ a: 1000, c: 'fund', d: '2025-03-05', src: 'quy' });
    await addExp({ a: 1000, c: 'bill', d: '2025-10-06', src: 'cb' });
    await createExpense('tay', exp());
    expect((await listSrc('quy')).sort((x, y) => x.m.localeCompare(y.m))).toEqual([b, a]);
    expect(await listSrc('cb')).toHaveLength(1);
  });

  it('sửa trong màn hình chi tiêu không làm mất liên kết src của khoản tự ghi', async () => {
    const ref = await addExp({ a: 1000, c: 'fund', i: 'Quỹ A', d: '2025-10-05', src: 'quy' }, 321);
    const next = await updateExpense(ref, { a: 2000, d: '2025-09-01' });
    expect(next).toEqual({ m: '2025-09', id: ref.id });
    expect(await getExp(next)).toMatchObject({ a: 2000, src: 'quy', i: 'Quỹ A', t: 321 });
    expect(await listSrc('quy')).toEqual([next]);
  });
});
