import AsyncStorage from '@react-native-async-storage/async-storage';

import { addPersonToList, loadPeople, removePersonFromList } from './peopleRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const KEY = 'sotien:people';
const raw = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('lần đầu (chưa có khóa)', () => {
  it('không có dữ liệu nào → tạo danh sách rỗng và lưu', async () => {
    expect(await loadPeople()).toEqual([]);
    expect(await raw(KEY)).toEqual([]);
  });

  it('lấy tên đã dùng trong Quỹ / Chia bill / Công nợ, bỏ "Tôi", "Người N", chữ A–T, trùng', async () => {
    await AsyncStorage.setItem('quy_nhom_v1', JSON.stringify({ contribs: [{ people: [{ name: 'Tôi' }, { name: 'An' }, { name: 'Người 2' }] }] }));
    await AsyncStorage.setItem('chiabill:v2:bills', JSON.stringify([{ people: [{ name: 'an' }, { name: 'B' }, { name: 'Bình' }] }]));
    await AsyncStorage.setItem('chiabill:v2:pays', JSON.stringify([{ from: 'Chi', to: 'Tôi' }]));
    // thứ tự như PWA: Chia bill, rồi Công nợ, rồi Quỹ; trùng giữ bản gặp đầu tiên ("an" của Chia bill)
    expect(await loadPeople()).toEqual(['an', 'Bình', 'Chi']);
    expect(await raw(KEY)).toEqual(['an', 'Bình', 'Chi']);
  });

  it('nguồn hỏng thì bỏ qua và không bị ghi đè', async () => {
    await AsyncStorage.setItem('quy_nhom_v1', '{hong');
    expect(await loadPeople()).toEqual([]);
    expect(await AsyncStorage.getItem('quy_nhom_v1')).toBe('{hong');
  });

  it('đã có khóa thì không lấy lại từ dữ liệu khác', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['An']));
    await AsyncStorage.setItem('quy_nhom_v1', JSON.stringify({ contribs: [{ people: [{ name: 'Bình' }] }] }));
    expect(await loadPeople()).toEqual(['An']);
  });
});

describe('thêm / bỏ', () => {
  it('thêm, trùng, "Tôi", trống', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['An']));
    expect(await addPersonToList('Bình')).toMatchObject({ status: 'added', name: 'Bình' });
    expect(await addPersonToList('bình')).toMatchObject({ status: 'exists', name: 'Bình' });
    expect(await addPersonToList('tôi')).toEqual({ status: 'me' });
    expect(await addPersonToList('  ')).toEqual({ status: 'empty' });
    expect(await raw(KEY)).toEqual(['An', 'Bình']);
  });

  it('bỏ một người; bỏ người không có thì không ghi', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['An', 'Bình']));
    await removePersonFromList('An');
    expect(await raw(KEY)).toEqual(['Bình']);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    await removePersonFromList('khong-co');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('các thao tác gọi dồn không đè nhau', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([]));
    await Promise.all(['A1', 'B2', 'C3', 'D4'].map((n) => addPersonToList(n)));
    expect((await raw(KEY)).sort()).toEqual(['A1', 'B2', 'C3', 'D4']);
  });

  it('JSON hỏng → ném StorageCorruptError và không ghi đè', async () => {
    await AsyncStorage.setItem(KEY, '[hong');
    await expect(loadPeople()).rejects.toBeInstanceOf(StorageCorruptError);
    await expect(addPersonToList('An')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await AsyncStorage.getItem(KEY)).toBe('[hong');
  });

  it('khóa có dữ liệu lạ: tên hợp lệ được giữ, mục lạ bị bỏ khi ghi (như PWA)', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['An', 5, null, 'Tôi']));
    expect(await loadPeople()).toEqual(['An', '5']);
  });
});
