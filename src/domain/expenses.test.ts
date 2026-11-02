import { MAX_AMOUNT } from '@/constants/categories';
import type { ExpenseSettings, ExpenseWithId } from '@/types/expense';

import { EMPTY_SETTINGS, addCustomCategory, allCategories, budgetForMonth, budgetSummary, buildExpense, categoriesInUse, categoryIconName, dayHeading, categoryPercent, donutSegments, filterByCategory, filterByPeriod, initialPeriodView, isBudgetMonthAllowed, isInPeriod, monthsInPeriod, newExpenseId, normalizeCustomRange, categoryBudgetStatus, normalizeSettings, parseAmountInput, periodFromParams, periodOf, periodToParams, removeCustomCategory, resolveCategory, sanitizeAmountDigits, savedMessage, setBudget, sumAmounts, summarizeByCategory, suggestedDateFor, validateExpenseInput } from './expenses';

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

  it('normalizeSettings giữ các tài khoản nhận tiền hợp lệ, bỏ mục sai dạng / trùng, tối đa 5; đọc được khoá `bank` của bản cũ', () => {
    const bank = { bin: '970422', account: '0123456789', name: '  NGUYEN VAN A ' };
    const clean = { bin: '970422', account: '0123456789', name: 'NGUYEN VAN A' };
    expect(normalizeSettings({ banks: [bank] }).banks).toEqual([clean]);
    expect(normalizeSettings({ bank }).banks).toEqual([clean]); // bản cũ: một tài khoản
    expect(normalizeSettings({ banks: [{ ...bank, bin: '9704' }, { ...bank, account: '12ab' }, 'x', bank, bank] }).banks).toEqual([clean]);
    expect(normalizeSettings({ banks: Array.from({ length: 8 }, (_, i) => ({ ...bank, account: `01234567${i}9` })) }).banks).toHaveLength(5);
    expect(normalizeSettings({}).banks).toBeUndefined();
  });

  it('hạn mức theo mục: chỉ giữ số dương; tình trạng so với hạn mức', () => {
    expect(normalizeSettings({ catBudgets: { food: 500000.4, bad: -1, zero: 0, text: 'x' } }).catBudgets).toEqual({ food: 500000 });
    expect(normalizeSettings({ catBudgets: [1] }).catBudgets).toBeUndefined();
    expect(categoryBudgetStatus(300_000, 500_000)).toEqual({ ratio: 0.6, remaining: 200_000, over: 0 });
    expect(categoryBudgetStatus(650_000, 500_000)).toEqual({ ratio: 1.3, remaining: 0, over: 150_000 });
    expect(categoryBudgetStatus(10, 0)).toEqual({ ratio: 0, remaining: 0, over: 0 });
  });

  it('hiddenPaid: chỉ giữ khoá chuỗi hợp lệ, không trùng', () => {
    expect(normalizeSettings({ hiddenPaid: ['loan:L1', 'loan:L1', 5, '', 'bill:k:b1'] }).hiddenPaid).toEqual(['loan:L1', 'bill:k:b1']);
    expect(normalizeSettings({ hiddenPaid: 'x' }).hiddenPaid).toBeUndefined();
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

  it('isBudgetMonthAllowed: tối đa 12 tháng sau tháng hiện tại', () => {
    expect(isBudgetMonthAllowed('2026-10', TODAY)).toBe(true);
    expect(isBudgetMonthAllowed('2026-11', TODAY)).toBe(false);
    expect(isBudgetMonthAllowed('2020-01', TODAY)).toBe(true);
    expect(isBudgetMonthAllowed('abc', TODAY)).toBe(false);
  });
});

describe('mục chi', () => {
  it('có 12 mục mặc định (có Đầu tư), Khác luôn ở cuối kể cả khi có mục riêng', () => {
    expect(allCategories(EMPTY_SETTINGS)).toHaveLength(12);
    const r = addCustomCategory(EMPTY_SETTINGS, 'Thú cưng', 'pet', 1);
    if (!r.ok) throw new Error('lẽ ra thêm được');
    const list = allCategories(r.settings);
    expect(list).toHaveLength(13);
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
    expect(list).toHaveLength(12);
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

describe('categoryPercent (tỷ lệ % của mục)', () => {
  it('làm tròn 1 chữ số thập phân; các mục cộng lại xấp xỉ 100', () => {
    expect(categoryPercent(375, 1000)).toBe(37.5);
    expect(categoryPercent(1, 3)).toBe(33.3);
    expect(categoryPercent(1000, 1000)).toBe(100);
    const parts = [1, 1, 1].map((n) => categoryPercent(n, 3));
    expect(Math.abs(parts.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.5);
  });

  it('tổng hoặc số tiền không dương thì 0', () => {
    expect(categoryPercent(0, 100)).toBe(0);
    expect(categoryPercent(50, 0)).toBe(0);
    expect(categoryPercent(-5, 100)).toBe(0);
  });
});
