/**
 * Quy tắc chi tiêu cá nhân (thuần TypeScript, không phụ thuộc React Native hay lưu trữ).
 * Mỗi hàm được chuyển từ khối `mod-a` của PWA cũ và giữ nguyên hành vi.
 * Tiền tính bằng ĐỒNG. Ngày là chuỗi 'YYYY-MM-DD' theo giờ máy; `today` luôn được truyền vào để dễ kiểm thử.
 */

import {
  AMOUNT_MAX_DIGITS,
  CATEGORY_NAME_MAX,
  CUSTOM_COLORS,
  CUSTOM_ICON_IDS,
  CUSTOM_RANGE_MAX_YEARS,
  DEFAULT_CATEGORIES,
  FALLBACK_ICON,
  ICON_PATHS,
  MAX_AMOUNT,
  MAX_CUSTOM_CATEGORIES,
  MAX_DAY_BUCKETS,
  MEMO_MAX,
} from '@/constants/categories';
import type {
  Category,
  CustomCategory,
  DateStr,
  Expense,
  ExpenseInput,
  ExpenseSettings,
  ExpenseWithId,
  MonthKey,
  Period,
} from '@/types/expense';
import type { Vnd } from '@/types/money';
import {
  addDays,
  addMonths,
  daysInMonth,
  daysInclusive,
  formatVnDate,
  isValidDateStr,
  isValidMonthKey,
  monthOf,
  monthsBetween,
  weekdayName,
} from '@/utils/date';

// ───────────────────────── Cài đặt (ngân sách, mục riêng) ─────────────────────────

export const EMPTY_SETTINGS: ExpenseSettings = { budget: 0, budgets: {}, cats: [] };

/** Đọc `sct:settings` thô thành dạng an toàn (hàm `At` của PWA). */
export function normalizeSettings(raw: unknown): ExpenseSettings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const budgets = obj.budgets && typeof obj.budgets === 'object' ? (obj.budgets as Record<MonthKey, Vnd>) : {};
  return {
    budget: Number(obj.budget) || 0,
    budgets,
    cats: Array.isArray(obj.cats) ? (obj.cats as CustomCategory[]) : [],
  };
}

/** Tháng đặt ngân sách gần nhất không sau `month`; null nếu chưa có (hàm `Ot`). */
export function budgetStartMonth(settings: ExpenseSettings, month: MonthKey): MonthKey | null {
  const keys = Object.keys(settings.budgets ?? {})
    .filter((key) => key <= month)
    .sort();
  return keys.length ? keys[keys.length - 1] : null;
}

/** Ngân sách áp dụng cho một tháng (hàm `qt`). Mức 0 nghĩa là "không đặt từ tháng đó". */
export function budgetForMonth(settings: ExpenseSettings, month: MonthKey): Vnd {
  const start = budgetStartMonth(settings, month);
  return start ? Number(settings.budgets[start]) || 0 : settings.budget || 0;
}

/** Lưu ngân sách bắt đầu từ `month` (0 = bỏ ngân sách từ tháng đó). Không sửa đối tượng cũ. */
export function setBudget(settings: ExpenseSettings, month: MonthKey, amount: Vnd): ExpenseSettings {
  const safe = Number.isFinite(amount) && amount > 0 ? Math.min(Math.round(amount), MAX_AMOUNT) : 0;
  return { ...settings, budgets: { ...settings.budgets, [month]: safe } };
}

export type BudgetNote =
  | { kind: 'starts-here' }
  | { kind: 'since'; since: MonthKey }
  | { kind: 'legacy' }
  | { kind: 'unset' };

/** Ghi chú giải thích mức ngân sách đang áp dụng cho tháng đang chọn trong Thiết lập. */
export function budgetNote(settings: ExpenseSettings, month: MonthKey): BudgetNote {
  const start = budgetStartMonth(settings, month);
  if (start === month) return { kind: 'starts-here' };
  if (start) return { kind: 'since', since: start };
  if (budgetForMonth(settings, month)) return { kind: 'legacy' };
  return { kind: 'unset' };
}

/** Trong Thiết lập chỉ được chọn tháng đến tối đa 12 tháng sau tháng hiện tại. */
export function isBudgetMonthAllowed(month: MonthKey, today: DateStr): boolean {
  return isValidMonthKey(month) && month <= addMonths(monthOf(today), 12);
}

// ───────────────────────── Mục chi ─────────────────────────

/** Mục mặc định (trừ Khác) + mục riêng + Khác ở cuối (hàm `R`). */
export function allCategories(settings: ExpenseSettings): Category[] {
  const other = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  return [...DEFAULT_CATEGORIES.slice(0, -1), ...settings.cats, other];
}

/** Mục không còn tồn tại thì hiển thị là Khác (hàm `F`); dữ liệu khoản chi không bị sửa. */
export function resolveCategory(settings: ExpenseSettings, id: string): Category {
  const categories = allCategories(settings);
  return categories.find((cat) => cat.id === id) ?? categories[categories.length - 1];
}

export function isCustomCategory(settings: ExpenseSettings, id: string): boolean {
  return settings.cats.some((cat) => cat.id === id);
}

/** Tên biểu tượng thật sự có đường vẽ (hàm `X`). */
export function categoryIconName(category: Category): string {
  if (category.icon && ICON_PATHS[category.icon]) return category.icon;
  if (ICON_PATHS[category.id]) return category.id;
  return FALLBACK_ICON;
}

export type AddCategoryResult =
  | { ok: true; settings: ExpenseSettings; category: CustomCategory }
  | { ok: false; reason: 'empty' | 'duplicate' | 'limit' };

export function newCategoryId(now: number): string {
  return 'c' + now.toString(36);
}

/** Thêm mục riêng. Thứ tự kiểm tra như PWA: trống → trùng tên → quá giới hạn. */
export function addCustomCategory(
  settings: ExpenseSettings,
  name: string,
  icon: string,
  now: number = Date.now(),
): AddCategoryResult {
  const clean = name.trim().slice(0, CATEGORY_NAME_MAX);
  if (!clean) return { ok: false, reason: 'empty' };
  const lower = clean.toLowerCase();
  if (allCategories(settings).some((cat) => cat.name.toLowerCase() === lower)) {
    return { ok: false, reason: 'duplicate' };
  }
  if (settings.cats.length >= MAX_CUSTOM_CATEGORIES) return { ok: false, reason: 'limit' };
  const category: CustomCategory = {
    id: newCategoryId(now),
    name: clean,
    icon: (CUSTOM_ICON_IDS as readonly string[]).includes(icon) ? icon : FALLBACK_ICON,
    color: CUSTOM_COLORS[settings.cats.length % CUSTOM_COLORS.length],
  };
  return { ok: true, category, settings: { ...settings, cats: [...settings.cats, category] } };
}

/** Xoá mục riêng. Các khoản chi thuộc mục đó giữ nguyên dữ liệu, chỉ hiển thị là Khác. */
export function removeCustomCategory(settings: ExpenseSettings, id: string): ExpenseSettings {
  return { ...settings, cats: settings.cats.filter((cat) => cat.id !== id) };
}

// ───────────────────────── Nhập liệu ─────────────────────────

/** Chỉ giữ chữ số, bỏ số 0 đầu, tối đa 12 chữ số (hàm `U`). */
export function sanitizeAmountDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+/, '').slice(0, AMOUNT_MAX_DIGITS);
}

export function parseAmountInput(text: string): Vnd {
  return Number(sanitizeAmountDigits(text)) || 0;
}

/** Nút nhập nhanh +5k… cộng vào số hiện có, giới hạn như PWA. */
export function addToAmount(current: Vnd, delta: Vnd): Vnd {
  return Math.min(Math.max(0, current) + delta, MAX_AMOUNT);
}

export interface ExpenseValidation {
  valid: boolean;
  amountInvalid: boolean;
  dateInvalid: boolean;
}

/** Số tiền nguyên > 0 (tối đa 12 chữ số); ngày có thật và không sau hôm nay. */
export function validateExpenseInput(input: ExpenseInput, today: DateStr): ExpenseValidation {
  const amountInvalid = !(Number.isInteger(input.a) && input.a > 0 && input.a <= MAX_AMOUNT);
  const dateInvalid = !isValidDateStr(input.d) || input.d > today;
  return { valid: !amountInvalid && !dateInvalid, amountInvalid, dateInvalid };
}

/** Tạo bản ghi từ form. Giữ nguyên `t` khi sửa; ghi chú cắt còn 80 ký tự. */
export function buildExpense(input: ExpenseInput, existing: Pick<Expense, 't'> | null, now: number): Expense {
  return {
    a: input.a,
    c: input.c,
    n: input.n.trim().slice(0, MEMO_MAX),
    d: input.d,
    t: existing?.t || now,
  };
}

export function newExpenseId(now: number, random: () => number = Math.random): string {
  return now.toString(36) + random().toString(36).slice(2, 6);
}

// ───────────────────────── Kỳ xem ─────────────────────────

export function monthPeriod(today: DateStr): Period {
  return { mode: 'month', month: monthOf(today) };
}

/** Chuyển tháng/năm trước hoặc sau; kỳ khác giữ nguyên. */
export function shiftPeriod(period: Period, delta: number): Period {
  if (period.mode === 'month') return { mode: 'month', month: addMonths(period.month, delta) };
  if (period.mode === 'year') return { mode: 'year', year: period.year + delta };
  return period;
}

/** Không cho xem tương lai. */
export function canGoNext(period: Period, today: DateStr): boolean {
  if (period.mode === 'month') return period.month < monthOf(today);
  if (period.mode === 'year') return period.year < Number(today.slice(0, 4));
  return false;
}

/**
 * Trạng thái ô chọn thời gian ở Tổng quan. Giữ riêng tháng, năm và khoảng ngày để
 * đổi qua lại giữa các kiểu xem không làm mất lựa chọn trước đó (như PWA).
 */
export interface PeriodView {
  mode: Period['mode'];
  month: MonthKey;
  year: number;
  from: DateStr;
  to: DateStr;
}

/** Mặc định: xem tháng hiện tại; khoảng Tuỳ chọn là 30 ngày gần nhất. */
export function initialPeriodView(today: DateStr): PeriodView {
  return {
    mode: 'month',
    month: monthOf(today),
    year: Number(today.slice(0, 4)),
    from: addDays(today, -29),
    to: today,
  };
}

export function periodOf(view: PeriodView): Period {
  switch (view.mode) {
    case 'month':
      return { mode: 'month', month: view.month };
    case 'year':
      return { mode: 'year', year: view.year };
    case 'all':
      return { mode: 'all' };
    case 'custom':
      return { mode: 'custom', from: view.from, to: view.to };
  }
}

/** Ngày gợi ý khi thêm khoản chi: đang xem một tháng đã qua thì gợi ý mùng 1 của tháng đó. */
export function suggestedDateFor(period: Period, today: DateStr): DateStr {
  return period.mode === 'month' && period.month !== monthOf(today) ? `${period.month}-01` : today;
}

/** Kỳ xem -> tham số route (chuỗi) để truyền giữa các màn hình. */
export function periodToParams(period: Period): Record<string, string> {
  switch (period.mode) {
    case 'month':
      return { mode: 'month', month: period.month };
    case 'year':
      return { mode: 'year', year: String(period.year) };
    case 'all':
      return { mode: 'all' };
    case 'custom':
      return { mode: 'custom', from: period.from, to: period.to };
  }
}

/** Tham số route -> kỳ xem. Tham số thiếu hoặc sai thì dùng tháng hiện tại. */
export function periodFromParams(
  params: { mode?: string; month?: string; year?: string; from?: string; to?: string },
  today: DateStr,
): Period {
  if (params.mode === 'month' && params.month && isValidMonthKey(params.month)) {
    return { mode: 'month', month: params.month };
  }
  if (params.mode === 'year' && /^\d{4}$/.test(params.year ?? '')) {
    return { mode: 'year', year: Number(params.year) };
  }
  if (params.mode === 'all') return { mode: 'all' };
  if (
    params.mode === 'custom' &&
    params.from &&
    params.to &&
    isValidDateStr(params.from) &&
    isValidDateStr(params.to) &&
    params.from <= params.to
  ) {
    return { mode: 'custom', from: params.from, to: params.to };
  }
  return monthPeriod(today);
}

/** Danh sách tháng cần đọc dữ liệu cho một kỳ (hàm `z`). */
export function monthsInPeriod(period: Period, knownMonths: readonly MonthKey[], today: DateStr): MonthKey[] {
  switch (period.mode) {
    case 'all': {
      const months = [...new Set(knownMonths.filter(isValidMonthKey))].sort();
      return months.length ? months : [monthOf(today)];
    }
    case 'month':
      return [period.month];
    case 'year':
      return Array.from({ length: 12 }, (_, i) => `${period.year}-${String(i + 1).padStart(2, '0')}`);
    case 'custom':
      return monthsBetween(monthOf(period.from), monthOf(period.to), MAX_DAY_BUCKETS);
  }
}

/** Chỉ kỳ Tuỳ chọn lọc theo ngày; các kỳ khác lấy hết khoản trong các tháng đã đọc (hàm `Ht`). */
export function filterByPeriod<T extends Pick<Expense, 'd'>>(items: readonly T[], period: Period): T[] {
  if (period.mode !== 'custom') return [...items];
  return items.filter((item) => item.d >= period.from && item.d <= period.to);
}

export interface NormalizedRange {
  from: DateStr;
  to: DateStr;
  /** true nếu `from` bị đẩy lên vì vượt quá 5 năm. */
  clamped: boolean;
}

/** Chuẩn hoá khoảng ngày Tuỳ chọn: đến ≤ hôm nay, từ ≤ đến, tối đa 5 năm (hàm `Xt`). */
export function normalizeCustomRange(from: DateStr, to: DateStr, today: DateStr): NormalizedRange {
  let end = to;
  let start = from;
  if (end > today) end = today;
  if (start > end) start = end;
  const earliest = `${Number(end.slice(0, 4)) - CUSTOM_RANGE_MAX_YEARS}${end.slice(4)}`;
  let clamped = false;
  if (start < earliest) {
    start = earliest;
    clamped = true;
  }
  return { from: start, to: end, clamped };
}

export function monthHeading(month: MonthKey): string {
  return `Tháng ${Number(month.slice(5))}, ${month.slice(0, 4)}`;
}

/** Tiêu đề kỳ ở ô chọn thời gian (hàm `Jt`). */
export function periodTitle(period: Period): string {
  switch (period.mode) {
    case 'month':
      return `Tháng ${Number(period.month.slice(5))}/${period.month.slice(0, 4)}`;
    case 'year':
      return `Năm ${period.year}`;
    case 'all':
      return 'Tất cả';
    case 'custom':
      return `${formatVnDate(period.from)} – ${formatVnDate(period.to)}`;
  }
}

/** Cụm từ ngắn nối vào câu, ví dụ "tháng 10" (hàm `Vt`). */
export function periodPhrase(period: Period): string {
  switch (period.mode) {
    case 'all':
      return 'tất cả';
    case 'month':
      return `tháng ${Number(period.month.slice(5))}`;
    case 'year':
      return `năm ${period.year}`;
    case 'custom':
      return `${formatVnDate(period.from)} – ${formatVnDate(period.to)}`;
  }
}

/** Nhãn phía trên số tổng ở thẻ Đã chi. */
export function spentLabel(period: Period): string {
  if (period.mode === 'all') return 'Đã chi từ trước đến nay';
  if (period.mode === 'custom') {
    return `Đã chi từ ${formatVnDate(period.from)} đến ${formatVnDate(period.to)}`;
  }
  return `Đã chi trong ${periodPhrase(period)}`;
}

// ───────────────────────── Tổng hợp ─────────────────────────

export function sumAmounts(items: readonly Pick<Expense, 'a'>[]): Vnd {
  return items.reduce((total, item) => total + item.a, 0);
}

export interface CategorySummary {
  category: Category;
  sum: Vnd;
  n: number;
}

/** Tổng theo từng mục (kể cả mục 0 đồng), xếp tiền nhiều → ít, bằng nhau giữ thứ tự mục. */
export function summarizeByCategory(items: readonly Pick<Expense, 'a' | 'c'>[], settings: ExpenseSettings): CategorySummary[] {
  const totals = new Map<string, { sum: Vnd; n: number }>();
  for (const item of items) {
    const id = resolveCategory(settings, item.c).id;
    const entry = totals.get(id) ?? { sum: 0, n: 0 };
    entry.sum += item.a;
    entry.n += 1;
    totals.set(id, entry);
  }
  return allCategories(settings)
    .map((category) => ({ category, sum: totals.get(category.id)?.sum ?? 0, n: totals.get(category.id)?.n ?? 0 }))
    .sort((x, y) => y.sum - x.sum);
}

export interface DonutSegment {
  color: string;
  dash: number;
  gap: number;
  offset: number;
}

/** Hình học biểu đồ tròn: mỗi mục một cung, chừa khe nhỏ giữa các cung. */
export function donutSegments(summaries: readonly CategorySummary[], total: Vnd, radius = 40): DonutSegment[] {
  const nonZero = summaries.filter((s) => s.sum > 0);
  if (!total || !nonZero.length) return [];
  const circumference = 2 * Math.PI * radius;
  let used = 0;
  return nonZero.map((s) => {
    const arc = (s.sum / total) * circumference;
    const dash = Math.max(0.5, nonZero.length > 1 ? arc - 1.6 : arc);
    const segment = { color: s.category.color, dash, gap: circumference - dash, offset: -used };
    used += arc;
    return segment;
  });
}

// ───────────────────────── Lịch sử ─────────────────────────

export function filterByCategory(
  items: readonly ExpenseWithId[],
  settings: ExpenseSettings,
  categoryId: string | 'all',
): ExpenseWithId[] {
  if (categoryId === 'all') return [...items];
  return items.filter((item) => resolveCategory(settings, item.c).id === categoryId);
}

/** Các mục thật sự có khoản chi, theo thứ tự hiển thị (dùng cho chip lọc). */
export function categoriesInUse(items: readonly Pick<Expense, 'c'>[], settings: ExpenseSettings): Category[] {
  const used = new Set(items.map((item) => resolveCategory(settings, item.c).id));
  return allCategories(settings).filter((cat) => used.has(cat.id));
}

export interface DayGroup {
  date: DateStr;
  items: ExpenseWithId[];
  total: Vnd;
}

/** Nhóm theo ngày: ngày mới trước; trong ngày khoản tạo sau xếp trước. */
export function groupByDay(items: readonly ExpenseWithId[]): DayGroup[] {
  const sorted = [...items].sort((x, y) => y.d.localeCompare(x.d) || (y.t || 0) - (x.t || 0));
  const groups: DayGroup[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.d) {
      last.items.push(item);
      last.total += item.a;
    } else {
      groups.push({ date: item.d, items: [item], total: item.a });
    }
  }
  return groups;
}

/** "Hôm nay" hoặc tên thứ trong tuần. */
export function dayHeading(date: DateStr, today: DateStr): string {
  return date === today ? 'Hôm nay' : weekdayName(date);
}

// ───────────────────────── Ngân sách trên thẻ Đã chi ─────────────────────────

export interface BudgetSummary {
  budget: Vnd;
  /** Còn lại (có thể âm khi vượt). */
  remaining: Vnd;
  over: boolean;
  /** Tỷ lệ đã dùng, tối đa 100. */
  usedPercent: number;
  /** Số ngày còn lại tính cả hôm nay (0 nếu không áp dụng). */
  daysLeft: number;
  /** Mỗi ngày chi được khoảng bao nhiêu; null nếu không hiển thị. */
  perDay: Vnd | null;
}

/** Ngân sách chỉ có khi xem Tháng hoặc Năm; Tất cả/Tuỳ chọn không có. */
export function budgetSummary(
  total: Vnd,
  period: Period,
  settings: ExpenseSettings,
  today: DateStr,
): BudgetSummary | null {
  if (period.mode === 'all' || period.mode === 'custom') return null;
  const months = monthsInPeriod(period, [], today);
  const budget = months.reduce((sum, month) => sum + budgetForMonth(settings, month), 0);
  if (budget <= 0) return null;

  const remaining = budget - total;
  const over = remaining < 0;
  let daysLeft = 0;
  if (period.mode === 'month' && period.month === monthOf(today)) {
    daysLeft = daysInMonth(period.month) - Number(today.slice(8)) + 1;
  } else if (period.mode === 'year' && period.year === Number(today.slice(0, 4))) {
    daysLeft = daysInclusive(today, `${period.year}-12-31`);
  }
  return {
    budget,
    remaining,
    over,
    usedPercent: Math.min(100, (total / budget) * 100),
    daysLeft,
    perDay: !over && daysLeft > 0 ? remaining / daysLeft : null,
  };
}

// ───────────────────────── Biểu đồ cột ─────────────────────────

export interface Bucket {
  key: string;
  tip: string;
  sum: Vnd;
  now: boolean;
  future: boolean;
  /** Nhãn trục hoành, rỗng nếu không hiển thị. */
  axisLabel: string;
}

export interface BucketChart {
  buckets: Bucket[];
  unit: 'ngày' | 'tháng';
}

/** Đỉnh trục tung làm tròn "đẹp": 1, 2, 4, 5, 10 × lũy thừa 10 (hàm `Kt`). */
export function niceMax(value: number): number {
  if (value <= 0) return 1e5;
  const base = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 4, 5, 10]) {
    if (step * base >= value) return step * base;
  }
  return 10 * base;
}

/** Chiều cao cột theo %: cột có tiền tối thiểu 4%, cột trống 2%. */
export function barHeightPercent(sum: Vnd, scale: number): number {
  return sum ? Math.max(4, (sum / scale) * 100) : 2;
}

/** Chia các khoản chi vào cột theo ngày hoặc theo tháng (hàm `Ut`). */
export function buildBuckets(
  items: readonly Pick<Expense, 'a' | 'd'>[],
  period: Period,
  months: readonly MonthKey[],
  today: DateStr,
): BucketChart {
  const dayBucket = (key: DateStr): Bucket => ({
    key,
    tip: `Ngày ${formatVnDate(key)}`,
    sum: 0,
    now: key === today,
    future: key > today,
    axisLabel: '',
  });
  const buckets: Bucket[] = [];
  let unit: 'ngày' | 'tháng' = 'ngày';

  if (period.mode === 'month') {
    const count = daysInMonth(period.month);
    for (let day = 1; day <= count; day++) {
      const bucket = dayBucket(`${period.month}-${String(day).padStart(2, '0')}`);
      if ([1, 5, 10, 15, 20, 25].includes(day) || day === count) bucket.axisLabel = String(day);
      buckets.push(bucket);
    }
  } else if (period.mode === 'custom' && daysInclusive(period.from, period.to) <= MAX_DAY_BUCKETS) {
    const count = daysInclusive(period.from, period.to);
    const step = Math.ceil(count / 4);
    for (let i = 0; i < count; i++) {
      const bucket = dayBucket(addDays(period.from, i));
      if (i % step === 0 && i <= count - step / 2) bucket.axisLabel = formatVnDate(bucket.key);
      buckets.push(bucket);
    }
  } else {
    unit = 'tháng';
    const currentMonth = monthOf(today);
    const spansYears = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
    const every = Math.ceil(months.length / (spansYears ? 6 : 12));
    months.forEach((month, index) => {
      buckets.push({
        key: month,
        tip: `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`,
        sum: 0,
        now: month === currentMonth,
        future: month > currentMonth,
        axisLabel:
          index % every === 0
            ? spansYears
              ? `${Number(month.slice(5))}/${month.slice(2, 4)}`
              : `T${Number(month.slice(5))}`
            : '',
      });
    });
  }

  const position = new Map(buckets.map((bucket, index) => [bucket.key, index]));
  for (const item of items) {
    const index = position.get(unit === 'ngày' ? item.d : item.d.slice(0, 7));
    if (index !== undefined) buckets[index].sum += item.a;
  }
  return { buckets, unit };
}

export interface BucketStats {
  /** Đỉnh trục tung đã làm tròn. */
  scale: number;
  maxSum: Vnd;
  maxBucket: Bucket | null;
  /** Trung bình mỗi cột đã qua (không tính cột tương lai, tối thiểu chia 1). */
  average: Vnd;
}

export function bucketStats(buckets: readonly Bucket[], total: Vnd): BucketStats {
  const maxSum = Math.max(...buckets.map((b) => b.sum), 0);
  const elapsed = Math.max(1, buckets.filter((b) => !b.future).length);
  return {
    scale: niceMax(maxSum),
    maxSum,
    maxBucket: buckets.find((b) => b.sum === maxSum) ?? null,
    average: total / elapsed,
  };
}
