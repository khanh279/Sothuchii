import { useEffect } from 'react';

import { subscribeStorageWrites } from '@/data/storage';

/**
 * Tự tải lại dữ liệu của một màn hình NGAY khi có ai ghi vào các khóa lưu trữ `keys` (kể cả màn hình đang nằm phía sau, chưa được mở lại):
 * nhờ vậy sau khi thanh toán / ghi xong, mọi màn hình đang mở đều đã có số mới, không đợi quay lại mới nhảy số. Gộp nhiều lần ghi liên tiếp thành một lần tải.
 * Mỗi phần tử của `keys` là một khóa nguyên văn, hoặc kết thúc bằng `*` để khớp mọi khóa có tiền tố đó (ví dụ `sct:m:*` cho các khóa tháng chi tiêu).
 */
export function useReloadOnWrite(keys: readonly string[], reload: () => Promise<void> | void) {
  const keyList = keys.join('|');
  useEffect(() => {
    const patterns = keyList.split('|');
    const matches = (key: string) => patterns.some((pattern) => (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeStorageWrites((written) => {
      if (timer || !written.some(matches)) return;
      timer = setTimeout(() => {
        timer = null;
        void reload();
      }, 0);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [keyList, reload]);
}
