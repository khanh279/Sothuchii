import {
  buildContributionPeople,
  clampPeopleCount,
  contributionSavedMessage,
  contributionSummary,
  contributionTitle,
  enableAllMode,
  fundExpenseSavedMessage,
  overspends,
  resizeRows,
  rowsFromContribution,
  setAllAmounts,
  validateContribution,
  validateFundExpense,
} from './fundForms';
import { parseNghinInput } from './money';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const row = (name: string, amount: number) => ({ name, amount });

describe('số người đóng', () => {
  it('giới hạn 1–200, chữ không hợp lệ là 1', () => {
    expect(clampPeopleCount('0')).toBe(1);
    expect(clampPeopleCount('-5')).toBe(1);
    expect(clampPeopleCount('abc')).toBe(1);
    expect(clampPeopleCount('')).toBe(1);
    expect(clampPeopleCount('7')).toBe(7);
    expect(clampPeopleCount('999')).toBe(200);
    expect(clampPeopleCount(200.9)).toBe(200);
    expect(clampPeopleCount(3)).toBe(3);
  });

  it('tăng số dòng: dòng mới mang số tiền chung; giảm thì cắt cuối và giữ phần còn lại', () => {
    const base = [row('Tôi', 50_000), row('An', 10_000)];
    expect(resizeRows(base, 4, 30_000)).toEqual([row('Tôi', 50_000), row('An', 10_000), row('', 30_000), row('', 30_000)]);
    expect(resizeRows(base, 1, 0)).toEqual([row('Tôi', 50_000)]);
    expect(resizeRows(base, 500, 0)).toHaveLength(200);
    expect(resizeRows([], 0, 5)).toEqual([row('', 5)]); // luôn còn ít nhất 1 dòng
  });

  it('không sửa mảng đầu vào', () => {
    const base = [row('Tôi', 1)];
    resizeRows(base, 3, 9);
    setAllAmounts(base, 5);
    expect(base).toEqual([row('Tôi', 1)]);
  });
});

describe('áp dụng cho tất cả', () => {
  it('đặt cùng số tiền cho mọi dòng, giữ tên', () => {
    expect(setAllAmounts([row('A', 1), row('B', 2)], 7)).toEqual([row('A', 7), row('B', 7)]);
  });

  it('bật chế độ: ưu tiên số đang gõ, không có thì lấy số dòng đầu', () => {
    expect(enableAllMode([row('A', 5_000), row('B', 9_000)], 0)).toEqual({ each: 5_000, rows: [row('A', 5_000), row('B', 5_000)] });
    expect(enableAllMode([row('A', 5_000)], 8_000)).toEqual({ each: 8_000, rows: [row('A', 8_000)] });
    expect(enableAllMode([], 0)).toEqual({ each: 0, rows: [] });
  });

  it('dựng form từ lần đóng đã lưu: cùng tiền thì bật "tất cả"', () => {
    expect(rowsFromContribution({ people: [row('A', 1000), row('B', 1000)] })).toEqual({
      rows: [row('A', 1000), row('B', 1000)],
      all: true,
      each: 1000,
    });
    expect(rowsFromContribution({ people: [row('A', 1000), row('B', 2000)] })).toMatchObject({ all: false, each: 0 });
  });
});

describe('tổng và người sẽ lưu', () => {
  it('tổng và số người có tiền', () => {
    expect(contributionSummary([row('', 0), row('A', 20_000), row('B', 30_000)])).toEqual({ total: 50_000, payers: 2 });
    expect(contributionSummary([])).toEqual({ total: 0, payers: 0 });
  });

  it('chỉ giữ người có tiền > 0; tên trống thành "Người N" theo thứ tự dòng', () => {
    const rows = [row('  Tôi  ', 50_000), row('', 0), row('', 20_000), row('   ', 5_000)];
    expect(buildContributionPeople(rows)).toEqual([row('Tôi', 50_000), row('Người 3', 20_000), row('Người 4', 5_000)]);
  });

  it('đơn vị: ô nhập "50" nghìn thành 50.000 đồng khi lưu; giữ nguyên phần lẻ', () => {
    const amounts = ['50', '7,5', '0,001'].map(parseNghinInput);
    expect(amounts).toEqual([50_000, 7_500, 1]);
    expect(buildContributionPeople(amounts.map((a) => row('x', a))).map((p) => p.amount)).toEqual(amounts);
  });

  it('tiêu đề trống thành "Đóng quỹ"', () => {
    expect(contributionTitle('  ')).toBe('Đóng quỹ');
    expect(contributionTitle(' T10 ')).toBe('T10');
  });
});

describe('kiểm tra form', () => {
  it('lần đóng: lỗi theo đúng thứ tự và đúng câu chữ', () => {
    const ok = { date: '2025-10-05', fundId: 'f', people: [row('A', 1)], all: false };
    expect(validateContribution(ok)).toBeNull();
    expect(validateContribution({ ...ok, date: '' })).toBe('Chọn ngày.');
    expect(validateContribution({ ...ok, fundId: '' })).toBe('Chọn quỹ trước khi lưu.');
    expect(validateContribution({ ...ok, people: [], all: true })).toBe('Nhập số tiền mỗi người (đơn vị nghìn đồng).');
    expect(validateContribution({ ...ok, people: [], all: false })).toBe('Nhập số tiền (đơn vị nghìn đồng) cho ít nhất một người.');
    expect(validateContribution({ ...ok, date: '', fundId: '' })).toBe('Chọn ngày.');
  });

  it('khoản chi: lỗi theo đúng thứ tự và đúng câu chữ', () => {
    const ok = { title: 'Mua nước', date: '2025-10-05', fundId: 'f', amount: 50_000 };
    expect(validateFundExpense(ok)).toBeNull();
    expect(validateFundExpense({ ...ok, title: '   ' })).toBe('Nhập nội dung chi.');
    expect(validateFundExpense({ ...ok, date: '' })).toBe('Chọn ngày chi.');
    expect(validateFundExpense({ ...ok, fundId: '' })).toBe('Chọn quỹ trước khi lưu.');
    expect(validateFundExpense({ ...ok, amount: 0 })).toBe('Nhập số tiền lớn hơn 0.');
    expect(validateFundExpense({ ...ok, amount: NaN })).toBe('Nhập số tiền lớn hơn 0.');
  });
});

describe('vượt quỹ và thông báo', () => {
  it('thêm mới: so với số dư hiện có', () => {
    expect(overspends(100_000, 100_000)).toBe(false);
    expect(overspends(100_000, 100_001)).toBe(true);
    expect(overspends(-5, 1)).toBe(true);
  });

  it('sửa: được hoàn lại số tiền cũ của chính khoản đó trước khi trừ số mới', () => {
    // số dư 20.000 sau khi đã chi 80.000; sửa 80.000 → 100.000 thì còn 0 → không vượt; → 100.001 thì vượt
    expect(overspends(20_000, 100_000, 80_000)).toBe(false);
    expect(overspends(20_000, 100_001, 80_000)).toBe(true);
  });

  it('thông báo sau khi lưu', () => {
    expect(fundExpenseSavedMessage(false, false)).toBe('Đã lưu khoản chi');
    expect(fundExpenseSavedMessage(false, true)).toBe('Đã lưu. Lưu ý: khoản chi vượt quá quỹ hiện có');
    expect(fundExpenseSavedMessage(true, true)).toBe('Đã lưu thay đổi');
    expect(contributionSavedMessage(false)).toBe('Đã lưu khoản thu');
    expect(contributionSavedMessage(true)).toBe('Đã lưu thay đổi');
  });
});
