import type { Vnd } from '@/types/money';

/** Bản nháp "Chụp nhanh" chuyển sang form chi tiêu / tạo bill / chi tiêu quỹ để điền sẵn nội dung, số tiền và ảnh. Chỉ giữ trong bộ nhớ, form đọc rồi xoá. */
export interface QuickDraft {
  title: string;
  amount: Vnd;
  ph: string[];
}

let draft: QuickDraft | null = null;

export const setQuickDraft = (next: QuickDraft | null) => {
  draft = next;
};

/** Đọc mà chưa xoá (bộ khởi tạo state có thể chạy hai lần); form gọi `clearQuickDraft` trong effect sau khi dựng. */
export const peekQuickDraft = (): QuickDraft | null => draft;
export const clearQuickDraft = () => {
  draft = null;
};
