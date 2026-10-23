import { removeKeys, saveJson, saveJsonStrict, saveManyJsonStrict, setRawMany, subscribeStorageWrites } from './storage';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
describe('thông báo ghi lưu trữ (để màn hình đang mở tải lại số mới ngay)', () => {
  it('mỗi lần ghi / xoá đều báo đúng các khóa đã đổi', async () => {
    const seen: string[][] = [];
    const unsubscribe = subscribeStorageWrites((keys) => seen.push([...keys]));

    await saveJson('k1', { a: 1 });
    await saveJsonStrict('k2', [1]);
    await saveManyJsonStrict([
      ['k3', 1],
      ['k4', 2],
    ]);
    await setRawMany([['k5', '"x"']]);
    await removeKeys(['k1', 'k2']);

    expect(seen).toEqual([['k1'], ['k2'], ['k3', 'k4'], ['k5'], ['k1', 'k2']]);
    unsubscribe();
  });

  it('huỷ đăng ký thì không nhận thông báo nữa', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeStorageWrites(listener);
    unsubscribe();
    await saveJsonStrict('k9', 1);
    expect(listener).not.toHaveBeenCalled();
  });
});
