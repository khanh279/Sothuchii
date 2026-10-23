/**
 * Định dạng ghi chú nhỏ hiển thị (dòng phụ của thẻ lịch sử, giá trị ở trang Chi tiết): các nội dung ghép bằng dấu chấm giữa " · " được tách thành
 * từng dòng riêng, và chữ đầu mỗi dòng viết hoa. Dòng xuống sẵn có (`\n`) được giữ. Chỉ đổi cách hiển thị, không đổi dữ liệu lưu.
 */
export function formatNote(value: string): string {
  return value
    .split('\n')
    .flatMap((line) => line.split(/\s·\s/))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('vi') + part.slice(1))
    .join('\n');
}
