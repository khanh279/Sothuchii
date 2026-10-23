import { useSyncExternalStore } from 'react';

/**
 * Khoá cuộn trang khi đang vuốt ngang một dòng (Sửa / Xoá): `SwipeRow` bật khoá từ lúc giành được cử chỉ ngang tới lúc thả tay, các danh sách cuộn dùng
 * `LockableScrollView` thì tạm tắt cuộn dọc trong lúc đó. Nhờ vậy chỉ cử chỉ DỌC mới cuộn trang, vuốt ngang (kể cả hơi chéo) không kéo trang lướt theo.
 * Giá trị chỉ nằm trong bộ nhớ phiên chạy, không phải dữ liệu nghiệp vụ.
 */
let locked = false;
const listeners = new Set<() => void>();

export function setSwipeLock(next: boolean): void {
  if (locked === next) return;
  locked = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSwipeLocked(): boolean {
  return useSyncExternalStore(subscribe, () => locked, () => false);
}
