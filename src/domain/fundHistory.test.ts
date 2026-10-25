import { buildFundHistory, buildOverviewFundCard, entryCategory, filterDaysByCategory, filterDaysByPerson, mergePayoutEntries } from './fundHistory';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const funds = [
  { id: 'a', name: 'Quỹ A' },
  { id: 'b', name: 'Quỹ B' },
];
const contribs = [
  {
    id: 'c1',
    fundId: 'a',
    title: 'T10',
    date: '2025-10-05',
    people: [
      { name: 'Tôi', amount: 100_000 },
      { name: 'An', amount: 50_000 },
    ],
  },
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

describe('buildFundHistory với chi quỹ nâng cao', () => {
  const data = {
    funds: [{ id: 'f1', name: 'Quỹ' }],
    contribs: [{ id: 'c1', fundId: 'f1', title: 'Đóng', date: '2025-10-01', people: [{ name: 'Tôi', amount: 1_000_000 }] }],
    expenses: [
      { id: 'e1', fundId: 'f1', title: 'Chi trực tiếp', date: '2025-10-02', amount: 100_000 },
      { id: 'e2', fundId: 'f1', title: 'Cá nhân ứng', date: '2025-10-03', amount: 300_000, mode: 'personal' as const, payer: 'A' },
      { id: 'e3', fundId: 'f1', title: 'Chi từ ứng', date: '2025-10-04', amount: 200_000, mode: 'advance' as const, payer: 'B', advanceId: 'a1' },
    ],
    advances: [{ id: 'a1', fundId: 'f1', person: 'B', title: 'Giao B', date: '2025-10-03', amount: 500_000 }],
    txns: [
      { id: 't1', fundId: 'f1', kind: 'refund' as const, person: 'B', amount: 300_000, date: '2025-10-05', advanceId: 'a1' },
      { id: 't2', fundId: 'f1', kind: 'payout' as const, person: 'A', amount: 300_000, date: '2025-10-06', expenseId: 'e2' },
    ],
    cur: 'f1',
  };

  it('có đủ các loại dòng, tổng thu / chi chỉ tính thu và chi thực tế (không cộng giao tiền, hoàn tiền, thanh toán)', () => {
    const history = buildFundHistory(data, 'all', { mode: 'all' });
    expect(history.days.flatMap((day) => day.entries.map((entry) => entry.kind)).sort()).toEqual(['advance', 'contribution', 'expense', 'expense', 'expense', 'payout']);
    expect(history.totalIn).toBe(1_000_000);
    expect(history.totalOut).toBe(600_000); // 100k + 300k + 200k, mỗi khoản chi đúng một lần
    expect(history.balance).toBe(400_000); // thu − tổng chi thực tế, công thức có sẵn
  });

  it('khoản chi mang người chi / hồ sơ; dòng giao tiền và thanh toán không có trong tổng chi dù cùng kỳ', () => {
    const entries = buildFundHistory(data, 'all', { mode: 'all' }).days.flatMap((day) => day.entries);
    expect(entries.find((e) => e.id === 'e2')).toMatchObject({ person: 'A', meta: 'Chi quỹ · A ứng' });
    expect(entries.find((e) => e.id === 'e3')).toMatchObject({ person: 'B', advanceId: 'a1', meta: 'Chi từ tiền ứng · B' });
    expect(entries.find((e) => e.id === 'a1')).toMatchObject({ kind: 'advance', amount: 200_000 }) // 500k giao − 300k đã hoàn: hoàn tiền không có dòng riêng;
  });

  it('dữ liệu cũ (không có hồ sơ / giao dịch) cho kết quả như trước', () => {
    const old = { funds: data.funds, contribs: data.contribs, expenses: [data.expenses[0]] };
    const history = buildFundHistory(old, 'all', { mode: 'all' });
    expect(history.count).toBe(2);
    expect(history.totalOut).toBe(100_000);
  });
});

describe('filterDaysByPerson', () => {
  it('chỉ giữ dòng của đúng người, bỏ ngày trống; không lọc khi rỗng; không đổi danh sách gốc', () => {
    const days = [
      {
        date: '2025-10-03',
        entries: [
          { kind: 'expense' as const, id: 'e1', date: '2025-10-03', title: 'x', fundId: 'f', amount: 1, meta: '', person: 'A' },
          { kind: 'expense' as const, id: 'e2', date: '2025-10-03', title: 'y', fundId: 'f', amount: 1, meta: '', person: 'B' },
        ],
      },
      { date: '2025-10-01', entries: [{ kind: 'contribution' as const, id: 'c1', date: '2025-10-01', title: 'z', fundId: 'f', amount: 1, meta: '' }] },
    ];
    const a = filterDaysByPerson(days, 'A');
    expect(a).toHaveLength(1);
    expect(a[0].entries.map((e) => e.id)).toEqual(['e1']);
    expect(filterDaysByPerson(days, '')).toHaveLength(2);
    expect(days[0].entries).toHaveLength(2);
  });
});

describe('buildFundHistory — quỹ trả cho cá nhân ứng chi', () => {
  // DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
  const advanced = {
    funds: [{ id: 'f1', name: 'Quỹ lớp' }],
    contribs: [],
    expenses: [{ id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 200_000, mode: 'personal' as const, payer: 'An' }],
    advances: [],
    txns: [{ id: 't1', fundId: 'f1', kind: 'payout' as const, person: 'An', amount: 80_000, date: '2025-10-08', expenseId: 'x1' }],
  };

  it('tiêu đề to là nội dung khoản A đã chi, ghi chú nhỏ "A ứng chi"', () => {
    const history = buildFundHistory(advanced, 'all', { mode: 'all' });
    const entry = history.days.flatMap((day) => day.entries).find((item) => item.kind === 'payout');
    expect(entry).toMatchObject({ title: 'Mua nước', meta: 'An ứng chi · 04/10/2025', person: 'An', expenseId: 'x1' });
  });
});

describe('mergePayoutEntries — gộp quỹ trả cùng nội dung trong một ngày', () => {
  // DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
  const d = {
    funds: [{ id: 'f1', name: 'Quỹ lớp' }],
    contribs: [],
    expenses: [
      { id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 200_000, mode: 'personal' as const, payer: 'An' },
      { id: 'x2', fundId: 'f1', title: 'Thuê sân', date: '2025-10-04', amount: 100_000, mode: 'personal' as const, payer: 'An' },
    ],
    advances: [],
    txns: [
      { id: 't1', fundId: 'f1', kind: 'payout' as const, person: 'An', amount: 50_000, date: '2025-10-08', expenseId: 'x1' },
      { id: 't2', fundId: 'f1', kind: 'payout' as const, person: 'An', amount: 70_000, date: '2025-10-08', expenseId: 'x1' },
      { id: 't3', fundId: 'f1', kind: 'payout' as const, person: 'An', amount: 30_000, date: '2025-10-08', expenseId: 'x2' },
      { id: 't4', fundId: 'f1', kind: 'payout' as const, person: 'An', amount: 20_000, date: '2025-10-09', expenseId: 'x1' },
    ],
  };

  it('cùng ngày + cùng người + cùng nội dung → một dòng cộng số tiền; khác nội dung hoặc khác ngày thì giữ riêng', () => {
    const merged = mergePayoutEntries(buildFundHistory(d, 'all', { mode: 'all' }).days);
    const payouts = merged.flatMap((day) =>
      day.entries.filter((entry) => entry.kind === 'payout').map((entry) => ({ date: day.date, title: entry.title, amount: entry.amount, ids: entry.mergedIds?.length })),
    );
    expect(payouts).toEqual(
      expect.arrayContaining([
        { date: '2025-10-08', title: 'Mua nước', amount: 120_000, ids: 2 },
        { date: '2025-10-08', title: 'Thuê sân', amount: 30_000, ids: 1 },
        { date: '2025-10-09', title: 'Mua nước', amount: 20_000, ids: 1 },
      ]),
    );
    expect(payouts).toHaveLength(3);
  });

  it('không đổi dữ liệu gốc', () => {
    const history = buildFundHistory(d, 'all', { mode: 'all' });
    const before = JSON.stringify(history.days);
    mergePayoutEntries(history.days);
    expect(JSON.stringify(history.days)).toBe(before);
  });
});

describe('mergePayoutEntries — gộp khoản Quỹ giao A ứng chi cùng ngày', () => {
  it('cùng ngày + cùng người + cùng nội dung → một dòng; khác ngày giữ riêng', () => {
    const d = {
      funds: [{ id: 'f1', name: 'Quỹ' }],
      contribs: [],
      expenses: [
        { id: 'x1', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 200_000, mode: 'advance' as const, payer: 'An', advanceId: 'a1' },
        { id: 'x2', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 100_000, mode: 'advance' as const, payer: 'An', advanceId: 'a2' },
        { id: 'x3', fundId: 'f1', title: 'Mua nước', date: '2025-10-05', amount: 50_000, mode: 'advance' as const, payer: 'An', advanceId: 'a2' },
      ],
      advances: [],
      txns: [],
    };
    const rows = mergePayoutEntries(buildFundHistory(d, 'all', { mode: 'all' }).days).flatMap((day) =>
      day.entries.map((e) => ({ date: day.date, amount: e.amount, ids: e.mergedIds?.length })),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { date: '2025-10-04', amount: 300_000, ids: 2 },
        { date: '2025-10-05', amount: 50_000, ids: 1 },
      ]),
    );
    expect(rows).toHaveLength(2);
  });
});

describe('mergePayoutEntries — gộp các lần quỹ GIAO tiền ứng cùng ngày', () => {
  const d = {
    funds: [
      { id: 'f1', name: 'Quỹ' },
      { id: 'f2', name: 'Quỹ 2' },
    ],
    contribs: [],
    expenses: [],
    advances: [
      { id: 'a1', fundId: 'f1', person: 'An', title: 'Mua đồ', date: '2025-10-04', amount: 300_000 },
      { id: 'a2', fundId: 'f1', person: 'An', title: 'Thêm', date: '2025-10-04', amount: 200_000 },
      { id: 'a3', fundId: 'f1', person: 'Bình', title: 'Mua đồ', date: '2025-10-04', amount: 50_000 },
      { id: 'a4', fundId: 'f1', person: 'An', title: 'Mua đồ', date: '2025-10-05', amount: 70_000 },
      { id: 'a5', fundId: 'f2', person: 'An', title: 'Mua đồ', date: '2025-10-04', amount: 10_000 },
    ],
    txns: [],
  };
  const rows = mergePayoutEntries(buildFundHistory(d, 'all', { mode: 'all' }).days).flatMap((day) => day.entries.filter((e) => e.kind === 'advance').map((e) => ({ date: day.date, person: e.person, fund: e.fundId, amount: e.amount, ids: [...(e.mergedIds ?? [])].sort() })));

  it('cùng ngày + cùng người + cùng quỹ → một dòng (cộng tiền, giữ mã các lần giao); khác người, khác ngày, khác quỹ giữ riêng', () => {
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        { date: '2025-10-04', person: 'An', fund: 'f1', amount: 500_000, ids: ['a1', 'a2'] },
        { date: '2025-10-04', person: 'Bình', fund: 'f1', amount: 50_000, ids: ['a3'] },
        { date: '2025-10-05', person: 'An', fund: 'f1', amount: 70_000, ids: ['a4'] },
        { date: '2025-10-04', person: 'An', fund: 'f2', amount: 10_000, ids: ['a5'] },
      ]),
    );
  });
});

describe('lọc lịch sử quỹ theo loại khoản', () => {
  it('entryCategory: thu quỹ, chi trực tiếp, cá nhân ứng chi (khoản chi có người chi và dòng quỹ trả), giao tiền ứng', () => {
    expect(entryCategory({ kind: 'contribution' })).toBe('contribution');
    expect(entryCategory({ kind: 'expense' })).toBe('direct');
    expect(entryCategory({ kind: 'expense', person: 'An' })).toBe('personal');
    expect(entryCategory({ kind: 'payout', person: 'An' })).toBe('personal');
    expect(entryCategory({ kind: 'advance', person: 'An' })).toBe('advance');
    expect(entryCategory({ kind: 'refund', person: 'An' })).toBe('advance');
  });

  it('filterDaysByCategory: chỉ giữ đúng loại, bỏ ngày trống; null = không lọc', () => {
    const entry = (id: string, kind: 'contribution' | 'expense' | 'advance', person?: string) => ({ kind, id, date: '2025-10-01', title: id, fundId: 'a', amount: 1, meta: '', ...(person ? { person } : {}) });
    const days = [
      { date: '2025-10-02', entries: [entry('e1', 'expense'), entry('e2', 'expense', 'An')] },
      { date: '2025-10-01', entries: [entry('c1', 'contribution')] },
    ];
    expect(filterDaysByCategory(days, 'direct').flatMap((d) => d.entries.map((e) => e.id))).toEqual(['e1']);
    expect(filterDaysByCategory(days, 'personal').flatMap((d) => d.entries.map((e) => e.id))).toEqual(['e2']);
    expect(filterDaysByCategory(days, 'contribution')).toHaveLength(1);
    expect(filterDaysByCategory(days, 'advance')).toEqual([]);
    expect(filterDaysByCategory(days, null)).toHaveLength(2);
  });
});
