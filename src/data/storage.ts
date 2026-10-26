import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Các khóa lưu trữ của PWA cũ. Giữ nguyên tên để sau này nhập dữ liệu cũ không phải đổi khóa.
 * (Đã xác minh từ index.html của PWA.)
 */
export const StorageKeys = {
  settings: 'sct:settings', // chi tiêu: ngân sách, mục chi (tiền: đồng)
  expenseMonthPrefix: 'sct:m:', // chi tiêu: mỗi tháng một khóa, ví dụ 'sct:m:2025-10' (tiền: đồng)
  fund: 'quy_nhom_v1', // quỹ nhóm: contribs[], expenses[] (tiền: đồng)
  bills: 'chiabill:v2:bills', // chia bill (tiền: ĐỒNG)
  pays: 'chiabill:v2:pays', // thanh toán / chuyển tiền (tiền: ĐỒNG)
  billMoneyUnit: 'chiabill:unit', // 'vnd' = bills/pays đã chuyển từ nghìn đồng sang đồng (xem data/moneyMigration)
  billsKBackup: 'chiabill:v2:bills:nghin-backup', // bản gốc (nghìn đồng) giữ lại khi chuyển đổi
  paysKBackup: 'chiabill:v2:pays:nghin-backup',
  billNames: 'chiabill:names',
  me: 'chiabill:me',
  meV4: 'chiabill:v4:me',
  people: 'sotien:people',
  language: 'sct:lang', // ngôn ngữ giao diện đã chọn: 'vi' | 'en' (không nằm trong sao lưu / xoá dữ liệu)
} as const;

type WriteListener = (keys: readonly string[]) => void;
const writeListeners = new Set<WriteListener>();

/** Đăng ký nhận thông báo MỖI KHI có khóa được ghi / xoá (để màn hình đang mở tải lại số mới ngay). Trả về hàm huỷ đăng ký. */
export function subscribeStorageWrites(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
}

function notifyWrite(keys: readonly string[]) {
  for (const listener of [...writeListeners]) listener(keys);
}

/** Dữ liệu đã có nhưng không đọc được (JSON hỏng). Tuyệt đối không ghi đè khi gặp lỗi này. */
export class StorageCorruptError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Dữ liệu ở khóa "${key}" bị hỏng, không đọc được.`);
    this.name = 'StorageCorruptError';
    this.key = key;
  }
}

/** Đọc JSON; lỗi hoặc chưa có dữ liệu thì trả về `fallback` (giống hành vi `b.get` của PWA). */
export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Ghi JSON. Trả về true nếu thành công, để giao diện biết khi lưu thất bại. */
export async function saveJson<T>(key: string, value: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    notifyWrite([key]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Đọc JSON nghiêm ngặt: chưa có dữ liệu → undefined; JSON hỏng → ném StorageCorruptError;
 * lỗi bộ nhớ → ném lỗi gốc. Dùng cho các thao tác đọc-sửa-ghi để không ghi đè dữ liệu hỏng.
 */
export async function loadJsonStrict<T>(key: string): Promise<T | undefined> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null || raw === undefined || raw === '') return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new StorageCorruptError(key);
  }
}

/** Ghi JSON, ném lỗi nếu thất bại. */
export async function saveJsonStrict<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  notifyWrite([key]);
}

/** Ghi nhiều khóa trong một lệnh (theo thứ tự cho trước). Ném lỗi nếu thất bại. */
export async function saveManyJsonStrict(entries: readonly (readonly [string, unknown])[]): Promise<void> {
  await AsyncStorage.multiSet(entries.map(([key, value]) => [key, JSON.stringify(value)] as [string, string]));
  notifyWrite(entries.map(([key]) => key));
}

export async function listKeys(): Promise<string[]> {
  return [...(await AsyncStorage.getAllKeys())];
}

/** Đọc nguyên văn (chuỗi) nhiều khóa; khóa chưa có thì là null. Dùng để lưu bản dự phòng trước khi ghi đè. */
export async function getRawMany(keys: readonly string[]): Promise<Record<string, string | null>> {
  const pairs = keys.length ? await AsyncStorage.multiGet([...keys]) : [];
  return Object.fromEntries(pairs.map(([key, value]) => [key, value ?? null]));
}

/** Ghi nguyên văn nhiều khóa (không qua JSON.stringify). Ném lỗi nếu thất bại. */
export async function setRawMany(entries: readonly (readonly [string, string])[]): Promise<void> {
  if (entries.length) {
    await AsyncStorage.multiSet(entries.map(([key, value]) => [key, value] as [string, string]));
    notifyWrite(entries.map(([key]) => key));
  }
}

/** Xoá các khóa. Ném lỗi nếu thất bại. */
export async function removeKeys(keys: readonly string[]): Promise<void> {
  if (keys.length) {
    await AsyncStorage.multiRemove([...keys]);
    notifyWrite(keys);
  }
}
