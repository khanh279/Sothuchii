import { MAX_AMOUNT } from '@/constants/categories';
import type { ExpenseSettings, ExpenseWithId } from '@/types/expense';

import {
  EMPTY_SETTINGS,
  addCustomCategory,
  addToAmount,
  allCategories,
  barHeightPercent,
  budgetForMonth,
  budgetNote,
  budgetSummary,
  buildBuckets,
  buildExpense,
  bucketStats,
  canGoNext,
  categoriesInUse,
  categoryIconName,
  dayHeading,
  donutSegments,
  filterByCategory,
  filterByPeriod,
  groupByDay,
  initialPeriodView,
  isBudgetMonthAllowed,
  isInPeriod,
  monthsInPeriod,
  newExpenseId,
  niceMax,
  normalizeCustomRange,
  normalizeSettings,
  parseAmountInput,
  periodFromParams,
  periodOf,
  periodPhrase,
  periodToParams,
  periodTitle,
  removeCustomCategory,
  resolveCategory,
  sanitizeAmountDigits,
  savedMessage,
  setBudget,
  shiftPeriod,
  spentLabel,
  sumAmounts,
  summarizeByCategory,
  suggestedDateFor,
  validateExpenseInput,
} from './expenses';

// DỮ LIỆU MẪU do tôi tự tạo để kiểm thử quy tắc; KHÔNG phải dữ liệu thật của người dùng.
const TODAY = '2025-10-08';
const exp = (id: string, a: number, c: string, d: string, t = 1): ExpenseWithId => ({ id, a, c, n: '', d, t });

describe('settings & ngân sách', () => {
  it('normalizeSettings chịu được dữ liệu hỏng', () => {
    expect(normalizeSettings(null)).toEqual(EMPTY_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(EMPTY_SETTINGS);
    expect(normalizeSettings({ budget: '5000', cats: 'x', budgets: 3 })).toEqual({ budget: 5000, budgets: {}, cats: [] });
    expect(normalizeSettings({ budget: 1, budgets: { '2025-01': 9 }, cats: [] }).budgets).toEqual({ '2025-01': 9 });
  });

  it('budgetForMonth lấy mức đặt ở tháng gần nhất không sau tháng đang xét', () => {
    const s: ExpenseSettings = { budget: 1_000_000, budgets: { '2025-03': 2_000_000, '2025-07': 3_000_000 }, cats: [] };
    expect(budgetForMonth(s, '2025-02')).toBe(1_000_000); // trước mọi mốc → mức cũ
    expect(budgetForMonth(s, '2025-03')).toBe(2_000_000);
    expect(budgetForMonth(s, '2025-05')).toBe(2_000_000);
    expect(budgetForMonth(s, '2025-07')).toBe(3_000_000);
    expect(budgetForMonth(s, '2026-12')).toBe(3_000_000);
  });

  it('mức 0 nghĩa là bỏ ngân sách từ tháng đó', () => {
    const s: ExpenseSettings = { budget: 0, budgets: { '2025-03': 2_000_000, '2025-09': 0 }, cats: [] };
    expect(budgetForMonth(s, '2025-08')).toBe(2_000_000);
    expect(budgetForMonth(s, '2025-10')).toBe(0);
  });

  it('setBudget không sửa đối tượng cũ và chuẩn hoá số', () => {
    const s = setBudget(EMPTY_SETTINGS, '2025-10', 3_000_000);
    expect(s.budgets).toEqual({ '2025-10': 3_000_000 });
    expect(EMPTY_SETTINGS.budgets).toEqual({});
    expect(setBudget(s, '2025-10', 0).budgets['2025-10']).toBe(0);
    expect(setBudget(s, '2025-11', NaN).budgets['2025-11']).toBe(0);
    expect(setBudget(s, '2025-11', -5).budgets['2025-11']).toBe(0);
    expect(setBudget(s, '2025-11', 2 * MAX_AMOUNT).budgets['2025-11']).toBe(MAX_AMOUNT);
  });

  it('budgetNote mô tả mức đang áp dụng', () => {
    const s: ExpenseSettings = { budget: 0, budgets: { '2025-03': 1 }, cats: [] };
    expect(budgetNote(s, '2025-03')).toEqual({ kind: 'starts-here' });
    expect(budgetNote(s, '2025-06')).toEqual({ kind: 'since', since: '2025-03' });
    expect(budgetNote({ ...EMPTY_SETTINGS, budget: 5 }, '2025-06')).toEqual({ kind: 'legacy' });
    expect(budgetNote(EMPTY_SETTINGS, '2025-06')).toEqual({ kind: 'unset' });
  });

  it('isBudgetMonthAllowed: tối đa 12 tháng sau tháng hiện tại', () => {
    expect(isBudgetMonthAllowed('2026-10', TODAY)).toBe(true);
    expect(isBudgetMonthAllowed('2026-11', TODAY)).toBe(false);
    expect(isBudgetMonthAllowed('2020-01', TODAY)).toBe(true);
    expect(isBudgetMonthAllowed('abc', TODAY)).toBe(false);
  });
});

describe('mục chi', () => {
  it('có 11 mục mặc định, Khác luôn ở cuối kể cả khi có mục riêng', () => {
    expect(allCategories(EMPTY_SETTINGS)).toHaveLength(11);
    const r = addCustomCategory(EMPTY_SETTINGS, 'Thú cưng', 'pet', 1);
    if (!r.ok) throw new Error('lẽ ra thêm được');
    const list = allCategories(r.settings);
    expect(list).toHaveLength(12);
    expect(list[list.length - 1].id).toBe('other');
    expect(list[list.length - 2].name).toBe('Thú cưng');
  });

  it('thêm mục riêng: cắt tên, đặt màu quay vòng, kiểm tra icon', () => {
    const r = addCustomCategory(EMPTY_SETTINGS, `  ${'x'.repeat(40)}  `, 'khong-co', 255);
    if (!r.ok) throw new Error('lẽ ra thêm được');
    expect(r.category.name).toHaveLength(24);
    expect(r.category.icon).toBe('star');
    expect(r.category.id).toBe('c73');
    expect(r.category.color).toBe('#A0623A');
  });

  it('thêm mục riêng: trống, trùng tên (không phân biệt hoa thường), quá giới hạn', () => {
    expect(addCustomCategory(EMPTY_SETTINGS, '   ', 'pet')).toEqual({ ok: false, reason: 'empty' });
    expect(addCustomCategory(EMPTY_SETTINGS, 'ĂN UỐNG', 'pet')).toEqual({ ok: false, reason: 'duplicate' });
    let s = EMPTY_SETTINGS;
    for (let i = 0; i < 12; i++) {
      const r = addCustomCategory(s, `Mục ${i}`, 'home', i);
      if (!r.ok) throw new Error('lẽ ra thêm được ' + i);
      s = r.settings;
    }
    expect(addCustomCategory(s, 'Mục mới', 'home')).toEqual({ ok: false, reason: 'limit' });
    // màu quay vòng: mục thứ 7 dùng lại màu đầu
    expect(s.cats[6].color).toBe(s.cats[0].color);
  });

  it('xoá mục riêng: khoản chi hiển thị là Khác, dữ liệu không đổi', () => {
    const r = addCustomCategory(EMPTY_SETTINGS, 'Thú cưng', 'pet', 7);
    if (!r.ok) throw new Error();
    const id = r.category.id;
    expect(resolveCategory(r.settings, id).name).toBe('Thú cưng');
    const after = removeCustomCategory(r.settings, id);
    expect(after.cats).toHaveLength(0);
    expect(resolveCategory(after, id).id).toBe('other');
    expect(resolveCategory(EMPTY_SETTINGS, 'khong-ton-tai').id).toBe('other');
  });

  it('categoryIconName có phương án dự phòng', () => {
    expect(categoryIconName({ id: 'food', name: '', color: '' })).toBe('food');
    expect(categoryIconName({ id: 'fund', name: '', color: '', icon: 'coin' })).toBe('coin');
    expect(categoryIconName({ id: 'c1', name: '', color: '', icon: 'khong-co' })).toBe('star');
  });
});

describe('nhập liệu', () => {
  it('sanitizeAmountDigits / parseAmountInput', () => {
    expect(sanitizeAmountDigits('0012.345')).toBe('12345');
    expect(sanitizeAmountDigits('')).toBe('');
    expect(sanitizeAmountDigits('abc')).toBe('');
    expect(sanitizeAmountDigits('1234567890123')).toBe('123456789012');
    expect(parseAmountInput('50.000')).toBe(50000);
    expect(parseAmountInput('abc')).toBe(0);
  });

  it('addToAmount cộng dồn và bị chặn ở mức tối đa', () => {
    expect(addToAmount(0, 5000)).toBe(5000);
    expect(addToAmount(45000, 5000)).toBe(50000);
    expect(addToAmount(MAX_AMOUNT - 1000, 5000)).toBe(MAX_AMOUNT);
  });

  it('validateExpenseInput: biên và lỗi', () => {
    const ok = { a: 50000, c: 'food', n: '', d: TODAY };
    expect(validateExpenseInput(ok, TODAY).valid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: 1 }, TODAY).valid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: MAX_AMOUNT }, TODAY).valid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: 0 }, TODAY).amountInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: -5 }, TODAY).amountInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: 1.5 }, TODAY).amountInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: NaN }, TODAY).amountInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, a: MAX_AMOUNT + 1 }, TODAY).amountInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, d: '2025-10-09' }, TODAY).dateInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, d: '2025-02-30' }, TODAY).dateInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, d: '' }, TODAY).dateInvalid).toBe(true);
    expect(validateExpenseInput({ ...ok, d: TODAY }, TODAY).dateInvalid).toBe(false);
  });

  it('buildExpense giữ t cũ khi sửa, tạo t mới khi thêm, cắt ghi chú', () => {
    const input = { a: 1000, c: 'food', n: `  ${'a'.repeat(100)}  `, d: TODAY };
    const created = buildExpense(input, null, 777);
    expect(created.t).toBe(777);
    expect(created.n).toHaveLength(80);
    expect(buildExpense(input, { t: 5 }, 777).t).toBe(5);
    expect(created).not.toHaveProperty('src');
  });

  it('newExpenseId = thời gian base36 + 4 ký tự ngẫu nhiên', () => {
    expect(newExpenseId(36 * 36, () => 0.5)).toBe('100' + (0.5).toString(36).slice(2, 6));
    expect(newExpenseId(Date.now())).toMatch(/^[0-9a-z]+$/);
  });
});

describe('kỳ xem', () => {
  it('monthsInPeriod', () => {
    expect(monthsInPeriod({ mode: 'month', month: '2025-10' }, [], TODAY)).toEqual(['2025-10']);
    expect(monthsInPeriod({ mode: 'year', year: 2025 }, [], TODAY)).toHaveLength(12);
    expect(monthsInPeriod({ mode: 'year', year: 2025 }, [], TODAY)[0]).toBe('2025-01');
    expect(monthsInPeriod({ mode: 'all' }, ['2025-03', '2024-12', '2025-03', 'rac', '2025-1'], TODAY)).toEqual([
      '2024-12',
      '2025-03',
    ]);
    expect(monthsInPeriod({ mode: 'all' }, [], TODAY)).toEqual(['2025-10']);
    expect(monthsInPeriod({ mode: 'custom', from: '2025-09-15', to: '2025-11-02' }, [], TODAY)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
    ]);
    expect(monthsInPeriod({ mode: 'custom', from: '2000-01-01', to: '2025-10-01' }, [], TODAY)).toHaveLength(62);
  });

  it('filterByPeriod chỉ lọc theo ngày ở kỳ Tuỳ chọn (gồm cả hai đầu)', () => {
    const items = [exp('a', 1, 'food', '2025-10-01'), exp('b', 1, 'food', '2025-10-05'), exp('c', 1, 'food', '2025-10-09')];
    expect(filterByPeriod(items, { mode: 'custom', from: '2025-10-01', to: '2025-10-05' }).map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterByPeriod(items, { mode: 'month', month: '2025-10' })).toHaveLength(3);
    expect(filterByPeriod(items, { mode: 'all' })).toHaveLength(3);
  });

  it('normalizeCustomRange', () => {
    expect(normalizeCustomRange('2025-10-01', '2025-12-31', TODAY)).toEqual({ from: '2025-10-01', to: TODAY, clamped: false });
    expect(normalizeCustomRange('2025-10-07', '2025-10-01', TODAY)).toEqual({ from: '2025-10-01', to: '2025-10-01', clamped: false });
    expect(normalizeCustomRange('2018-01-01', TODAY, TODAY)).toEqual({ from: '2020-10-08', to: TODAY, clamped: true });
    expect(normalizeCustomRange('2020-10-08', TODAY, TODAY).clamped).toBe(false);
  });

  it('shiftPeriod / canGoNext không cho xem tương lai', () => {
    expect(shiftPeriod({ mode: 'month', month: '2025-01' }, -1)).toEqual({ mode: 'month', month: '2024-12' });
    expect(shiftPeriod({ mode: 'year', year: 2025 }, 1)).toEqual({ mode: 'year', year: 2026 });
    expect(shiftPeriod({ mode: 'all' }, 1)).toEqual({ mode: 'all' });
    expect(canGoNext({ mode: 'month', month: '2025-10' }, TODAY)).toBe(false);
    expect(canGoNext({ mode: 'month', month: '2025-09' }, TODAY)).toBe(true);
    expect(canGoNext({ mode: 'year', year: 2025 }, TODAY)).toBe(false);
    expect(canGoNext({ mode: 'year', year: 2024 }, TODAY)).toBe(true);
    expect(canGoNext({ mode: 'all' }, TODAY)).toBe(false);
  });

  it('periodToParams <-> periodFromParams đi về nguyên vẹn', () => {
    const periods = [
      { mode: 'month', month: '2025-03' },
      { mode: 'year', year: 2024 },
      { mode: 'all' },
      { mode: 'custom', from: '2025-01-05', to: '2025-02-10' },
    ] as const;
    for (const period of periods) {
      expect(periodFromParams(periodToParams(period), TODAY)).toEqual(period);
    }
  });

  it('periodFromParams: thiếu hoặc sai tham số thì về tháng hiện tại', () => {
    const fallback = { mode: 'month', month: '2025-10' };
    expect(periodFromParams({}, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'month', month: 'abc' }, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'year', year: '20x5' }, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'custom', from: '2025-02-30', to: '2025-03-01' }, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'custom', from: '2025-03-05', to: '2025-03-01' }, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'custom', from: '2025-03-05' }, TODAY)).toEqual(fallback);
    expect(periodFromParams({ mode: 'khac' }, TODAY)).toEqual(fallback);
  });

  it('isInPeriod', () => {
    expect(isInPeriod('2025-10-31', { mode: 'month', month: '2025-10' })).toBe(true);
    expect(isInPeriod('2025-11-01', { mode: 'month', month: '2025-10' })).toBe(false);
    expect(isInPeriod('2025-01-01', { mode: 'year', year: 2025 })).toBe(true);
    expect(isInPeriod('2024-12-31', { mode: 'year', year: 2025 })).toBe(false);
    expect(isInPeriod('1999-01-01', { mode: 'all' })).toBe(true);
    const custom = { mode: 'custom', from: '2025-10-05', to: '2025-10-10' } as const;
    expect(isInPeriod('2025-10-05', custom)).toBe(true);
    expect(isInPeriod('2025-10-10', custom)).toBe(true);
    expect(isInPeriod('2025-10-04', custom)).toBe(false);
    expect(isInPeriod('2025-10-11', custom)).toBe(false);
  });

  it('savedMessage: trong kỳ báo ghi/cập nhật, ngoài kỳ báo tháng đã lưu', () => {
    const period = { mode: 'month', month: '2025-10' } as const;
    expect(savedMessage({ isEdit: false, amount: 50000, date: '2025-10-08', period })).toBe('Đã ghi 50.000 ₫');
    expect(savedMessage({ isEdit: true, amount: 50000, date: '2025-10-08', period })).toBe('Đã cập nhật');
    expect(savedMessage({ isEdit: false, amount: 50000, date: '2025-09-30', period })).toBe('Đã lưu vào tháng 9, 2025');
    expect(savedMessage({ isEdit: true, amount: 1, date: '2025-09-30', period })).toBe('Đã lưu vào tháng 9, 2025');
  });

  it('initialPeriodView / periodOf', () => {
    const view = initialPeriodView(TODAY);
    expect(view).toEqual({ mode: 'month', month: '2025-10', year: 2025, from: '2025-09-09', to: TODAY });
    expect(periodOf(view)).toEqual({ mode: 'month', month: '2025-10' });
    expect(periodOf({ ...view, mode: 'year' })).toEqual({ mode: 'year', year: 2025 });
    expect(periodOf({ ...view, mode: 'all' })).toEqual({ mode: 'all' });
    expect(periodOf({ ...view, mode: 'custom' })).toEqual({ mode: 'custom', from: '2025-09-09', to: TODAY });
  });

  it('suggestedDateFor: tháng đã qua gợi ý mùng 1, còn lại là hôm nay', () => {
    expect(suggestedDateFor({ mode: 'month', month: '2025-10' }, TODAY)).toBe(TODAY);
    expect(suggestedDateFor({ mode: 'month', month: '2025-07' }, TODAY)).toBe('2025-07-01');
    expect(suggestedDateFor({ mode: 'year', year: 2024 }, TODAY)).toBe(TODAY);
    expect(suggestedDateFor({ mode: 'all' }, TODAY)).toBe(TODAY);
  });

  it('nhãn kỳ', () => {
    expect(periodTitle({ mode: 'month', month: '2025-10' })).toBe('Tháng 10/2025');
    expect(periodTitle({ mode: 'year', year: 2025 })).toBe('Năm 2025');
    expect(periodTitle({ mode: 'all' })).toBe('Tất cả');
    expect(periodPhrase({ mode: 'month', month: '2025-03' })).toBe('tháng 3');
    expect(spentLabel({ mode: 'all' })).toBe('Đã chi từ trước đến nay');
    expect(spentLabel({ mode: 'year', year: 2025 })).toBe('Đã chi trong năm 2025');
    expect(spentLabel({ mode: 'custom', from: '2025-10-01', to: '2025-10-08' })).toBe('Đã chi từ 01/10/2025 đến 08/10/2025');
  });
});

describe('tổng hợp theo mục', () => {
  const items = [
    exp('1', 50000, 'food', '2025-10-01'),
    exp('2', 30000, 'food', '2025-10-02'),
    exp('3', 20000, 'fun', '2025-10-03'),
    exp('4', 10000, 'da-xoa', '2025-10-04'),
  ];

  it('summarizeByCategory: xếp theo tiền, mục đã xoá gộp vào Khác, giữ cả mục 0 đồng', () => {
    const list = summarizeByCategory(items, EMPTY_SETTINGS);
    expect(list).toHaveLength(11);
    expect(list.slice(0, 3).map((s) => [s.category.id, s.sum, s.n])).toEqual([
      ['food', 80000, 2],
      ['fun', 20000, 1],
      ['other', 10000, 1],
    ]);
    expect(list.slice(3).every((s) => s.sum === 0 && s.n === 0)).toBe(true);
    expect(sumAmounts(items)).toBe(110000);
    expect(sumAmounts([])).toBe(0);
  });

  it('donutSegments: tổng cung bằng chu vi, có khe giữa các cung', () => {
    const list = summarizeByCategory(
      [exp('1', 750, 'food', '2025-10-01'), exp('2', 250, 'fun', '2025-10-01')],
      EMPTY_SETTINGS,
    );
    const segs = donutSegments(list, 1000);
    const circumference = 2 * Math.PI * 40;
    expect(segs).toHaveLength(2);
    expect(segs[0].dash).toBeCloseTo(0.75 * circumference - 1.6, 5);
    expect(segs[0].offset).toBeCloseTo(0, 5);
    expect(segs[1].offset).toBeCloseTo(-0.75 * circumference, 5);
    expect(segs[0].dash + segs[0].gap).toBeCloseTo(circumference, 5);
    expect(segs[0].color).toBe('#E0703A');
  });

  it('donutSegments: một mục thì vẽ kín, không có dữ liệu thì trống', () => {
    const one = donutSegments(summarizeByCategory([exp('1', 10, 'food', '2025-10-01')], EMPTY_SETTINGS), 10);
    expect(one).toHaveLength(1);
    expect(one[0].dash).toBeCloseTo(2 * Math.PI * 40, 5);
    expect(donutSegments(summarizeByCategory([], EMPTY_SETTINGS), 0)).toEqual([]);
  });
});

describe('lịch sử', () => {
  const items = [
    exp('a', 10, 'food', '2025-10-05', 1),
    exp('b', 20, 'fun', '2025-10-07', 5),
    exp('c', 30, 'food', '2025-10-07', 9),
    exp('d', 40, 'da-xoa', '2025-10-01', 2),
  ];

  it('groupByDay: ngày mới trước, trong ngày khoản tạo sau xếp trước', () => {
    const groups = groupByDay(items);
    expect(groups.map((g) => g.date)).toEqual(['2025-10-07', '2025-10-05', '2025-10-01']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(groups[0].total).toBe(50);
    expect(groupByDay([])).toEqual([]);
  });

  it('groupByDay không đổi mảng gốc và chịu được thiếu t', () => {
    const copy = [...items];
    groupByDay(items);
    expect(items).toEqual(copy);
    const noT = [{ id: 'x', a: 1, c: 'food', n: '', d: '2025-10-01' }] as unknown as ExpenseWithId[];
    expect(groupByDay(noT)).toHaveLength(1);
  });

  it('lọc theo mục (mục đã xoá thuộc Khác) và danh sách chip', () => {
    expect(filterByCategory(items, EMPTY_SETTINGS, 'food').map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterByCategory(items, EMPTY_SETTINGS, 'other').map((i) => i.id)).toEqual(['d']);
    expect(filterByCategory(items, EMPTY_SETTINGS, 'all')).toHaveLength(4);
    expect(categoriesInUse(items, EMPTY_SETTINGS).map((c) => c.id)).toEqual(['food', 'fun', 'other']);
  });

  it('dayHeading', () => {
    expect(dayHeading(TODAY, TODAY)).toBe('Hôm nay');
    expect(dayHeading('2025-10-07', TODAY)).toBe('Thứ ba');
  });
});

describe('budgetSummary', () => {
  const s: ExpenseSettings = { budget: 0, budgets: { '2025-10': 3_000_000 }, cats: [] };
  const month = { mode: 'month', month: '2025-10' } as const;

  it('tháng hiện tại: còn lại, tỷ lệ và số tiền mỗi ngày (tính cả hôm nay)', () => {
    const r = budgetSummary(1_200_000, month, s, TODAY);
    expect(r).toMatchObject({ budget: 3_000_000, remaining: 1_800_000, over: false, daysLeft: 24, perDay: 75_000 });
    expect(r?.usedPercent).toBeCloseTo(40, 5);
  });

  it('vượt ngân sách: không có mức chi mỗi ngày, thanh tối đa 100%', () => {
    const r = budgetSummary(3_500_000, month, s, TODAY);
    expect(r).toMatchObject({ remaining: -500_000, over: true, perDay: null, usedPercent: 100 });
  });

  it('chi đúng bằng ngân sách: còn 0, chưa tính là vượt', () => {
    const r = budgetSummary(3_000_000, month, s, TODAY);
    expect(r).toMatchObject({ remaining: 0, over: false, perDay: 0 });
  });

  it('tháng đã qua: không có mức chi mỗi ngày', () => {
    const r = budgetSummary(1, month, s, '2025-11-02');
    expect(r).toMatchObject({ daysLeft: 0, perDay: null });
  });

  it('ngày cuối tháng còn 1 ngày', () => {
    expect(budgetSummary(0, month, s, '2025-10-31')?.daysLeft).toBe(1);
    expect(budgetSummary(0, month, s, '2025-10-01')?.daysLeft).toBe(31);
  });

  it('năm hiện tại cộng ngân sách 12 tháng và đếm ngày tới 31/12', () => {
    const y: ExpenseSettings = { budget: 0, budgets: { '2025-01': 1_000_000 }, cats: [] };
    const r = budgetSummary(0, { mode: 'year', year: 2025 }, y, TODAY);
    expect(r?.budget).toBe(12_000_000);
    expect(r?.daysLeft).toBe(85);
  });

  it('không có ngân sách, hoặc kỳ Tất cả/Tuỳ chọn → null', () => {
    expect(budgetSummary(1, month, EMPTY_SETTINGS, TODAY)).toBeNull();
    expect(budgetSummary(1, { mode: 'all' }, s, TODAY)).toBeNull();
    expect(budgetSummary(1, { mode: 'custom', from: '2025-10-01', to: TODAY }, s, TODAY)).toBeNull();
  });
});

describe('biểu đồ cột', () => {
  it('niceMax', () => {
    expect(niceMax(0)).toBe(1e5);
    expect(niceMax(-1)).toBe(1e5);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(150_000)).toBe(200_000);
    expect(niceMax(400_000)).toBe(400_000);
    expect(niceMax(450_000)).toBe(500_000);
    expect(niceMax(600_000)).toBe(1_000_000);
    expect(niceMax(1_000_000)).toBe(1_000_000);
  });

  it('barHeightPercent', () => {
    expect(barHeightPercent(0, 100)).toBe(2);
    expect(barHeightPercent(1, 1000)).toBe(4);
    expect(barHeightPercent(500, 1000)).toBe(50);
  });

  it('theo ngày trong tháng: số cột, nhãn trục, hôm nay và tương lai', () => {
    const items = [
      { a: 100, d: '2025-02-03' },
      { a: 50, d: '2025-02-03' },
      { a: 70, d: '2025-02-10' },
      { a: 999, d: '2025-03-01' }, // ngoài tháng, bị bỏ qua
    ];
    const { buckets, unit } = buildBuckets(items, { mode: 'month', month: '2025-02' }, ['2025-02'], '2025-02-10');
    expect(unit).toBe('ngày');
    expect(buckets).toHaveLength(28);
    expect(buckets.filter((b) => b.axisLabel).map((b) => b.axisLabel)).toEqual(['1', '5', '10', '15', '20', '25', '28']);
    expect(buckets[2].sum).toBe(150);
    expect(buckets[9]).toMatchObject({ sum: 70, now: true, future: false });
    expect(buckets[10].future).toBe(true);
    expect(buckets[0].tip).toBe('Ngày 01/02/2025');
    const stats = bucketStats(buckets, 220);
    expect(stats.maxSum).toBe(150);
    expect(stats.maxBucket?.key).toBe('2025-02-03');
    expect(stats.scale).toBe(200);
    expect(stats.average).toBeCloseTo(22, 5); // 220 / 10 ngày đã qua
  });

  it('kỳ Tuỳ chọn ngắn: theo ngày, nhãn trục 4 điểm', () => {
    const { buckets, unit } = buildBuckets([], { mode: 'custom', from: '2025-10-01', to: '2025-10-08' }, ['2025-10'], TODAY);
    expect(unit).toBe('ngày');
    expect(buckets).toHaveLength(8);
    expect(buckets.filter((b) => b.axisLabel).map((b) => b.axisLabel)).toEqual(['01/10/2025', '03/10/2025', '05/10/2025', '07/10/2025']);
  });

  it('kỳ Tuỳ chọn dài hơn 62 ngày: gộp theo tháng', () => {
    const months = monthsInPeriod({ mode: 'custom', from: '2025-01-01', to: '2025-06-30' }, [], TODAY);
    const { unit, buckets } = buildBuckets(
      [{ a: 5, d: '2025-03-20' }],
      { mode: 'custom', from: '2025-01-01', to: '2025-06-30' },
      months,
      TODAY,
    );
    expect(unit).toBe('tháng');
    expect(buckets).toHaveLength(6);
    expect(buckets[2].sum).toBe(5);
  });

  it('theo tháng trong năm: nhãn T1..T12, tháng sau hôm nay là tương lai', () => {
    const months = monthsInPeriod({ mode: 'year', year: 2025 }, [], TODAY);
    const { buckets, unit } = buildBuckets([{ a: 10, d: '2025-10-05' }], { mode: 'year', year: 2025 }, months, TODAY);
    expect(unit).toBe('tháng');
    expect(buckets.map((b) => b.axisLabel)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']);
    expect(buckets[9]).toMatchObject({ sum: 10, now: true });
    expect(buckets[10].future).toBe(true);
    expect(buckets[0].tip).toBe('Tháng 1/2025');
  });

  it('kỳ Tất cả trải nhiều năm: nhãn dạng m/yy, thưa bớt', () => {
    const months = ['2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'];
    const { buckets } = buildBuckets([], { mode: 'all' }, months, TODAY);
    // 9 tháng / 6 → hiện cách 2 tháng một nhãn
    expect(buckets.map((b) => b.axisLabel)).toEqual(['11/24', '', '1/25', '', '3/25', '', '5/25', '', '7/25']);
  });

  it('không có dữ liệu: thống kê an toàn', () => {
    const { buckets } = buildBuckets([], { mode: 'month', month: '2025-10' }, ['2025-10'], TODAY);
    const stats = bucketStats(buckets, 0);
    expect(stats.maxSum).toBe(0);
    expect(stats.scale).toBe(1e5);
    expect(stats.average).toBe(0);
  });
});
