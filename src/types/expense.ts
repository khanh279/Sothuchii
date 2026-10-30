import type { Vnd } from '@/types/money';
import type { RecurringExpense } from '@/domain/recurring';

/** Ngày theo giờ máy, dạng 'YYYY-MM-DD'. Không bao giờ dùng toISOString() để tạo chuỗi này. */
export type DateStr = string;
/** Tháng dạng 'YYYY-MM'. Cũng là hậu tố khóa lưu 'sct:m:YYYY-MM'. */
export type MonthKey = string;

/**
 * Một khoản chi, đúng định dạng PWA đã lưu (khóa `sct:m:YYYY-MM`, giá trị `{ [id]: Expense }`).
 * Tiền tính bằng ĐỒNG (Vnd).
 */
export interface Expense {
  /** Số tiền (đồng), số nguyên dương. */
  a: Vnd;
  /** Id mục chi. Mục không còn tồn tại được hiển thị là 'other'. */
  c: string;
  /** Nội dung / ghi chú, tối đa 80 ký tự. */
  n: string;
  /** Ngày chi. */
  d: DateStr;
  /** Thời điểm tạo (ms), dùng để xếp thứ tự trong ngày. Không đổi khi sửa. */
  t: number;
  /** Dòng chi tiết phụ do module khác (bill, quỹ) ghi. Có thể thiếu. */
  i?: string;
  /** Nguồn tự ghi: 'cb' = chia bill, 'quy' = quỹ. Thiếu nếu người dùng tự nhập. */
  src?: string;
  /** Mã các ảnh đính kèm (xem `domain/photos`); thiếu = không có ảnh. */
  ph?: string[];
}

export type ExpenseWithId = Expense & { id: string };

/** Tham chiếu tới một khoản chi đã lưu (module quỹ lưu dạng `exp: {m, id}`). */
export interface ExpenseRef {
  m: MonthKey;
  id: string;
}

/** Mục chi do người dùng tự thêm (lưu trong settings.cats). */
export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Mục chi dùng để hiển thị (mặc định hoặc tự thêm). */
export interface Category {
  id: string;
  name: string;
  color: string;
  /** Tên biểu tượng; nếu thiếu thì dùng chính `id` làm tên biểu tượng. */
  icon?: string;
}

/** Tài khoản ngân hàng nhận tiền (dùng tạo mã QR chuyển khoản), lưu trong `sct:settings`. */
export interface BankAccount {
  /** Mã ngân hàng 6 số (xem `VN_BANKS`). */
  bin: string;
  /** Số tài khoản (chỉ chữ số, 6–19). */
  account: string;
  /** Tên chủ tài khoản, chỉ để hiện cạnh mã QR. */
  name: string;
}

/** `sct:settings`. */
export interface ExpenseSettings {
  /** Mức ngân sách cũ (trước khi có `budgets`), dùng khi chưa có mức theo tháng nào. */
  budget: Vnd;
  /** Ngân sách theo tháng: mức đặt ở tháng X áp dụng cho các tháng sau cho tới khi có mức khác. */
  budgets: Record<MonthKey, Vnd>;
  cats: CustomCategory[];
  /** Các tài khoản nhận tiền cho mã QR (tối đa `MAX_BANK_ACCOUNTS`); chưa thiết lập thì không có. Bản cũ chỉ có một tài khoản ở khoá `bank` được đọc thành danh sách một phần tử. */
  banks?: BankAccount[];
  /** Hạn mức chi MỖI THÁNG theo mục (id mục → đồng, > 0); mục không có thì không đặt hạn mức. */
  catBudgets?: Record<string, Vnd>;
  /** Chi tiêu định kỳ (xem `domain/recurring`). */
  recurring?: RecurringExpense[];
  /** Khoá các khoản đã thanh toán đã "Xóa lịch sử" ở ngăn xếp (chỉ ẩn khỏi ngăn xếp, dữ liệu giữ nguyên). */
  hiddenPaid?: string[];
}

/** Kỳ xem. 'custom' là khoảng ngày tuỳ chọn (gồm cả hai đầu). */
export type Period =
  | { mode: 'month'; month: MonthKey }
  | { mode: 'year'; year: number }
  | { mode: 'all' }
  | { mode: 'custom'; from: DateStr; to: DateStr };

/** Nguồn tự ghi vào chi tiêu cá nhân: 'cb' = chia bill, 'quy' = quỹ nhóm. */
export type ExpenseSource = 'cb' | 'quy';

/** Dữ liệu người dùng nhập vào form (đã tách khỏi chuỗi gõ tay). */
export interface ExpenseInput {
  a: Vnd;
  c: string;
  n: string;
  d: DateStr;
}
