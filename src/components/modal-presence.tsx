import { useEffect } from 'react';

/** Số Modal có bàn phím đang mở (mỗi Modal tự lo né bàn phím trong chính nó). */
let open = 0;

/**
 * Có Modal nào đang mở không. Bàn phím do ô nhập TRONG Modal gọi ra là chuyện của Modal đó: khung né bàn phím ở gốc ứng dụng (nằm phía sau Modal) phải bỏ qua,
 * nếu không cả trang phía sau (nút Thanh toán cố định, danh sách) bị đẩy lên và giật mỗi lần bàn phím hiện / tắt.
 */
export function isModalOpen(): boolean {
  return open > 0;
}

/** Đặt TRONG nội dung của một Modal có ô nhập (hoặc tự né bàn phím) để báo "đang có Modal". Không vẽ gì. */
export function ModalPresence() {
  useEffect(() => {
    open += 1;
    return () => {
      open -= 1;
    };
  }, []);
  return null;
}
