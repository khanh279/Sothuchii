import { useState } from 'react';

/**
 * Chọn MỘT đối tượng để lọc lịch sử và mở thanh toán (cặp A → B, một người…), dùng chung cho các chức năng thanh toán.
 * Chỉ quản lý trạng thái chọn: chạm đối tượng chưa chọn thì chuyển thẳng sang nó (không cần bỏ chọn cái cũ), chạm lại đối tượng đang chọn
 * thì bỏ chọn. Đối tượng đang chọn mà không còn trong `validKeys` (ví dụ vừa trả hết) bị bỏ chọn hẳn, nên không có trạng thái "mồ côi"
 * tự sống lại khi khoá đó xuất hiện lại sau này.
 * Không tính tiền và không ghi giao dịch: mỗi nghiệp vụ tự lọc và tự thanh toán bằng logic của nó.
 */
export function useSelectionFilter(validKeys: readonly string[]) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked !== null && validKeys.includes(picked) ? picked : null;
  // Đặt lại trong lúc render (mẫu "điều chỉnh state theo props") thay vì useEffect để không có khung hình lọc theo đối tượng đã biến mất.
  if (picked !== null && selected === null) setPicked(null);

  return {
    selected,
    toggle: (key: string) => setPicked(selected === key ? null : key),
    clear: () => setPicked(null),
    isSelected: (key: string) => key === selected,
  };
}
