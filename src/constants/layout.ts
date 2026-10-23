/**
 * Số đo bố cục dùng chung cho 5 trang gốc (Tổng quan, Chi tiêu, Chia bill, Công nợ, Quỹ nhóm).
 * Tiêu đề (`ScreenTitle`) và phần nội dung bắt đầu cùng một cao độ ở mọi tab: vùng an toàn phía trên + `titleTop`,
 * hàng tiêu đề cao cố định `titleRowHeight` (bằng nút "+" nên có hay không có nút cũng không lệch), rồi `contentTop` tới phần tử đầu tiên.
 */
export const PageLayout = {
  /** Lề trái/phải của tiêu đề và của mọi thẻ/hàng điều khiển chính. */
  paddingX: 16,
  /** Khoảng từ mép vùng an toàn phía trên tới hàng tiêu đề. */
  titleTop: 8,
  /** Chiều cao cố định của hàng tiêu đề (bằng nút `TitleAction`). */
  titleRowHeight: 40,
  /** Khoảng dưới hàng tiêu đề. */
  titleBottom: 8,
  /** Khoảng từ hàng tiêu đề tới phần tử đầu tiên của nội dung. */
  contentTop: 4,
  /** Khoảng giữa các khối nội dung ở trang gốc. */
  gap: 12,
  /** Đệm cuối danh sách (cộng thêm vùng an toàn phía dưới) để không bị thanh điều hướng nổi che. */
  bottomClearance: 110,
} as const;
