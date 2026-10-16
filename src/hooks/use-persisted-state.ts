import { useCallback, useState } from 'react';

/** Kho giữ giá trị theo khoá trong suốt phiên chạy (không lưu xuống máy); sống lâu hơn màn hình nếu màn hình bị gỡ khi đổi tab. */
const store = new Map<string, unknown>();

/**
 * Như `useState` nhưng nhớ giá trị theo `key`: chuyển tab rồi quay lại vẫn giữ nguyên kỳ và bộ lọc đã chọn của tab đó.
 * `initial` chỉ chạy khi chưa có giá trị đã nhớ.
 */
export function usePersistedState<T>(key: string, initial: () => T): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial()));
  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
