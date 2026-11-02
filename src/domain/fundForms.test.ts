import { buildContributionPeople, contributionSavedMessage, contributionSummary, contributionTitle, fundExpenseSavedMessage, rowsFromContribution, validateContribution, validateFundExpense } from './fundForms';
import { parseVndInput } from './money';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const row = (name: string, amount: number) => ({ name, amount });

describe('áp dụng cho tất cả', () => {

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

  it('đơn vị: chữ trong ô nhập là ĐỒNG, lưu đúng số đó (không nhân thêm)', () => {
    const amounts = ['50000', '7.500', '1'].map(parseVndInput);
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
    expect(validateContribution({ ...ok, people: [], all: true })).toBe('Nhập số tiền mỗi người.');
    expect(validateContribution({ ...ok, people: [], all: false })).toBe('Nhập số tiền cho ít nhất một người.');
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

describe('thông báo sau khi lưu', () => {
  it('thông báo sau khi lưu', () => {
    expect(fundExpenseSavedMessage(false)).toBe('Đã lưu khoản chi');
    expect(fundExpenseSavedMessage(true)).toBe('Đã lưu thay đổi');
    expect(contributionSavedMessage(false)).toBe('Đã lưu khoản thu');
    expect(contributionSavedMessage(true)).toBe('Đã lưu thay đổi');
  });
});
