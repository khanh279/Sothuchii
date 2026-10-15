import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Các khóa lưu trữ của PWA cũ. Giữ nguyên tên để sau này nhập dữ liệu cũ không phải đổi khóa.
 * (Đã xác minh từ index.html của PWA.)
 */
export const StorageKeys = {
  settings: 'sct:settings', // chi tiêu: ngân sách, mục chi (tiền: đồng)
  expenseMonthPrefix: 'sct:m:', // chi tiêu: mỗi tháng một khóa, ví dụ 'sct:m:2025-10' (tiền: đồng)
  fund: 'quy_nhom_v1', // quỹ nhóm: contribs[], expenses[] (tiền: đồng)
  bills: 'chiabill:v2:bills', // chia bill (tiền: NGHÌN đồng)
  pays: 'chiabill:v2:pays', // thanh toán / chuyển tiền (tiền: NGHÌN đồng)
  billNames: 'chiabill:names',
  me: 'chiabill:me',
  meV4: 'chiabill:v4:me',
  people: 'sotien:people',
} as const;

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
    return true;
  } catch {
    return false;
  }
}
