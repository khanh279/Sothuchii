/**
 * Đơn vị tiền. PWA cũ dùng hai đơn vị khác nhau:
 * - Chi tiêu cá nhân (mod-a) và Quỹ nhóm (mod-b): lưu bằng đồng (VND).
 * - Chia bill và công nợ (mod-c): lưu bằng NGHÌN đồng (có thể có số lẻ).
 *
 * Hai kiểu dưới đây chỉ là tên gọi để code dễ đọc; TypeScript vẫn coi chúng là number.
 * Muốn đổi qua lại, luôn dùng hàm trong `@/domain/money`.
 */
export type Vnd = number;
export type Nghin = number;
