/**
 * Báo cho các khung cuộn của biểu mẫu biết một ô nhập vừa được chọn (kể cả khi bàn phím đã mở sẵn và người dùng chuyển từ ô này sang ô khác),
 * để khung cuộn đưa ô đó lên khỏi vùng bàn phím che. Các ô nhập của ứng dụng (`AppTextInput`, `MoneyTextInput`) tự gọi `emitInputFocus`.
 */
const listeners = new Set<() => void>();

export function emitInputFocus() {
  listeners.forEach((listener) => listener());
}

export function onInputFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
