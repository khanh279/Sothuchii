import { buildFundHistory, buildOverviewFundCard } from './fundHistory';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const funds = [{ id: 'a', name: 'Quỹ A' }, { id: 'b', name: 'Quỹ B' }];
const contribs = [
  { id: 'c1', fundId: 'a', title: 'T10', date: '2025-10-05', people: [{ name: 'Tôi', amount: 100_000 }, { name: 'An', amount: 50_000 }] },
  { id: 'c2', fundId: 'b', title: '', date: '2025-09-01', people: [{ name: 'Bình', amount: 30_000 }] },
];
const expenses = [
  { id: 'e1', fundId: 'a', title: 'Cơm', date: '2025-10-05', amount: 40_000 },
  { id: 'e2', fundId: 'b', title: '', date: '2025-09-02', amount: 80_000 },
];
const data = { funds, contribs, expenses };
const month = (m: string) => ({ mode: 'month' as const, month: m });

describe('buildFundHistory', () => {
  it('gộp theo ngày, mới nhất trước; cùng ngày thì id lớn hơn trước', () => {
    const h = buildFundHistory(data, 'all', { mode: 'all' });
    expect(h.days.map((d) => d.date)).toEqual(['2025-10-05', '2025-09-02', '2025-09-01']);
    expect(h.days[0].entries.map((e) => e.id)).toEqual(['e1', 'c1']); // "e1" > "c1"
    expect(h.count).toBe(4);
  });

  it('tiêu đề trống dùng tên mặc định; dòng phụ nêu số người đóng hoặc "Chi quỹ"', () => {
    const h = buildFundHistory(data, 'all', { mode: 'all' });
    const flat = h.days.flatMap((d) => d.entries);
    expect(flat.find((e) => e.id === 'c2')).toMatchObject({ title: 'Đóng quỹ', meta: '1 người đóng', amount: 30_000, kind: 'contribution' });
    expect(flat.find((e) => e.id === 'e2')).toMatchObject({ title: 'Chi quỹ', meta: 'Chi quỹ', kind: 'expense' });
    expect(flat.find((e) => e.id === 'c1')?.amount).toBe(150_000);
  });

  it('lọc theo kỳ: tổng đóng/chi chỉ trong kỳ, số dư là toàn thời gian', () => {
    const h = buildFundHistory(data, 'all', month('2025-10'));
    expect(h).toMatchObject({ count: 2, totalIn: 150_000, totalOut: 40_000, balance: 60_000 });
    expect(buildFundHistory(data, 'all', month('2024-01'))).toMatchObject({ count: 0, totalIn: 0, totalOut: 0, balance: 60_000, days: [] });
  });

  it('lọc theo một quỹ; quỹ không tồn tại thì về tất cả', () => {
    const b = buildFundHistory(data, 'b', { mode: 'all' });
    expect(b).toMatchObject({ filter: 'b', count: 2, totalIn: 30_000, totalOut: 80_000, balance: -50_000, showFundName: false });
    expect(b.funds.map((f) => f.id)).toEqual(['b']);
    expect(buildFundHistory(data, 'khong-co', { mode: 'all' })).toMatchObject({ filter: 'all', count: 4 });
  });

  it('chỉ hiện tên quỹ khi xem tất cả và có nhiều hơn một quỹ', () => {
    expect(buildFundHistory(data, 'all', { mode: 'all' }).showFundName).toBe(true);
    expect(buildFundHistory({ ...data, funds: [funds[0]] }, 'all', { mode: 'all' }).showFundName).toBe(false);
  });

  it('khoản đúng ngày biên của kỳ tuỳ chọn được tính (cả hai đầu)', () => {
    const h = buildFundHistory(data, 'all', { mode: 'custom', from: '2025-09-02', to: '2025-10-05' });
    expect(h.days.map((d) => d.date)).toEqual(['2025-10-05', '2025-09-02']);
  });
});

describe('buildOverviewFundCard', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `Quỹ ${i}` }));
  const manyData = {
    funds: many,
    contribs: many.map((f, i) => ({ id: `c${i}`, fundId: f.id, title: '', date: '2025-10-01', people: [{ name: 'x', amount: (i + 1) * 1000 }] })),
    expenses: [],
  };

  it('ít quỹ: hiện hết, xếp theo |số dư| giảm dần, tổng theo kỳ', () => {
    const card = buildOverviewFundCard(data, month('2025-10'), true);
    expect(card.rows.map((r) => r.fund.id)).toEqual(['a', 'b']);
    expect(card).toMatchObject({ hidden: 0, canCollapse: false, fundCount: 2, totalIn: 150_000, totalOut: 40_000 });
  });

  it('nhiều quỹ: đang hiện tất cả thì có "Thu gọn"; thu gọn còn 3 dòng + "Xem thêm"', () => {
    const open = buildOverviewFundCard(manyData, { mode: 'all' }, true);
    expect(open.rows).toHaveLength(6);
    expect(open).toMatchObject({ hidden: 0, canCollapse: true });
    const folded = buildOverviewFundCard(manyData, { mode: 'all' }, false);
    expect(folded.rows.map((r) => r.fund.id)).toEqual(['f5', 'f4', 'f3']);
    expect(folded).toMatchObject({ hidden: 3, canCollapse: false });
  });

  it('đúng 4 quỹ thì không thu gọn', () => {
    const four = { ...manyData, funds: many.slice(0, 4) };
    expect(buildOverviewFundCard(four, { mode: 'all' }, false)).toMatchObject({ hidden: 0, canCollapse: false });
  });

  it('chưa có quỹ → thẻ trống', () => {
    expect(buildOverviewFundCard({ funds: [], contribs: [], expenses: [] }, { mode: 'all' }, true)).toMatchObject({ rows: [], fundCount: 0 });
  });
});
