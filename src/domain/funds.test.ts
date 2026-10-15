import type { ExpenseRef } from '@/types/expense';
import type { Contribution, Fund, FundData } from '@/types/fund';

import {
  contributionTotal,
  desiredLinkedExpense,
  fundBalance,
  fundPeriodTotals,
  fundTotals,
  normalizeFundData,
  ownContributionTotal,
  planFundExpenseSync,
  sortFundsByAbsBalance,
  type FundSyncAction,
  type LinkedExpenseSnapshot,
} from './funds';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const TODAY = '2025-10-08';
const ctx = { today: TODAY, newId: () => 'gen' };

const fundA: Fund = { id: 'f_a', name: 'Quỹ ăn trưa' };
const fundB: Fund = { id: 'f_b', name: 'Quỹ du lịch' };

const contrib = (id: string, people: [string, number][], over: Partial<Contribution> = {}): Contribution => ({
  id,
  fundId: 'f_a',
  title: 'Tháng 10',
  date: '2025-10-05',
  people: people.map(([name, amount]) => ({ name, amount })),
  ...over,
});

describe('normalizeFundData', () => {
  it('dữ liệu rỗng / hỏng cho ra dữ liệu trống an toàn', () => {
    const empty = { funds: [], contribs: [], expenses: [], cur: '' };
    expect(normalizeFundData(undefined, ctx)).toEqual(empty);
    expect(normalizeFundData(null, ctx)).toEqual(empty);
    expect(normalizeFundData('xyz', ctx)).toEqual(empty);
    expect(normalizeFundData([1, 2], ctx)).toEqual(empty);
    expect(normalizeFundData({ funds: 'x', contribs: 5, expenses: {} }, ctx)).toEqual(empty);
  });

  it('quỹ: bỏ mục không có id, tên mặc định "Quỹ", cắt tên còn 40 ký tự', () => {
    const data = normalizeFundData({ funds: [{ id: 1, name: 'A'.repeat(60) }, { name: 'khong-id' }, null, { id: 'x' }] }, ctx);
    expect(data.funds).toEqual([
      { id: '1', name: 'A'.repeat(40) },
      { id: 'x', name: 'Quỹ' },
    ]);
    expect(data.cur).toBe('1');
  });

  it('lần đóng: bỏ mục không có mảng people; gán mặc định cho trường thiếu', () => {
    const data = normalizeFundData(
      {
        funds: [{ id: 'f1', name: 'Q' }],
        contribs: [
          { id: 'c1', fundId: 'f1', people: [{ name: 'Tôi', amount: '5000' }, { amount: 'abc' }, null] },
          { id: 'c2', fundId: 'f1' },
          'rác',
        ],
      },
      ctx,
    );
    expect(data.contribs).toHaveLength(1);
    expect(data.contribs[0]).toEqual({
      id: 'c1',
      fundId: 'f1',
      title: '',
      date: TODAY,
      people: [
        { name: 'Tôi', amount: 5000 },
        { name: '', amount: 0 },
        { name: '', amount: 0 },
      ],
    });
  });

  it('giữ liên kết exp hợp lệ, bỏ exp thiếu m, sinh id khi thiếu', () => {
    const data = normalizeFundData(
      {
        funds: [{ id: 'f1', name: 'Q' }],
        contribs: [
          { fundId: 'f1', people: [], exp: { m: '2025-10', id: 77 } },
          { id: 'c2', fundId: 'f1', people: [], exp: { id: 'x' } },
        ],
      },
      ctx,
    );
    expect(data.contribs[0]).toMatchObject({ id: 'gen', exp: { m: '2025-10', id: '77' } });
    expect(data.contribs[1]).not.toHaveProperty('exp');
  });

  it('lần đóng/chi trỏ tới quỹ không tồn tại được gán về quỹ đầu tiên; không có quỹ thì rỗng', () => {
    const data = normalizeFundData(
      {
        funds: [{ id: 'f1', name: 'Q1' }, { id: 'f2', name: 'Q2' }],
        contribs: [{ id: 'c', fundId: 'khong-co', people: [] }],
        expenses: [{ id: 'e', fundId: 'f2', title: 'Mua', date: '2025-01-01', amount: '1200' }, { id: 'e2', fundId: 'moi' }],
        cur: 'f2',
      },
      ctx,
    );
    expect(data.contribs[0].fundId).toBe('f1');
    expect(data.expenses).toEqual([
      { id: 'e', fundId: 'f2', title: 'Mua', date: '2025-01-01', amount: 1200 },
      { id: 'e2', fundId: 'f1', title: '', date: TODAY, amount: 0 },
    ]);
    expect(data.cur).toBe('f2');
    expect(normalizeFundData({ contribs: [{ id: 'c', fundId: 'z', people: [] }] }, ctx).contribs[0].fundId).toBe('');
  });

  it('quỹ hiện tại không hợp lệ thì lấy quỹ đầu tiên', () => {
    expect(normalizeFundData({ funds: [{ id: 'a', name: 'A' }], cur: 'zzz' }, ctx).cur).toBe('a');
  });

  it('bỏ "Quỹ chung" cũ chỉ khi nó là quỹ duy nhất và hoàn toàn rỗng', () => {
    const legacy = { funds: [{ id: 'f', name: 'Quỹ chung' }] };
    expect(normalizeFundData(legacy, ctx).funds).toEqual([]);
    expect(normalizeFundData({ ...legacy, contribs: [{ id: 'c', fundId: 'f', people: [] }] }, ctx).funds).toHaveLength(1);
    expect(normalizeFundData({ ...legacy, expenses: [{ id: 'e', fundId: 'f' }] }, ctx).funds).toHaveLength(1);
    expect(normalizeFundData({ funds: [{ id: 'f', name: 'Quỹ chung' }, { id: 'g', name: 'Quỹ khác' }] }, ctx).funds).toHaveLength(2);
    expect(normalizeFundData({ funds: [{ id: 'f', name: 'Quỹ lớp' }] }, ctx).funds).toHaveLength(1);
  });

  it('không sửa đối tượng đầu vào', () => {
    const raw = { funds: [{ id: 'f', name: 'Quỹ chung' }], contribs: [], expenses: [] };
    const copy = JSON.parse(JSON.stringify(raw));
    normalizeFundData(raw, ctx);
    expect(raw).toEqual(copy);
  });
});

describe('số dư và tổng', () => {
  const data: Pick<FundData, 'funds' | 'contribs' | 'expenses'> = {
    funds: [fundA, fundB],
    contribs: [
      contrib('c1', [['Tôi', 100_000], ['An', 50_000]]),
      contrib('c2', [['Bình', 30_000]], { fundId: 'f_b', date: '2025-09-01' }),
    ],
    expenses: [
      { id: 'e1', fundId: 'f_a', title: 'Cơm', date: '2025-10-06', amount: 40_000 },
      { id: 'e2', fundId: 'f_b', title: 'Vé', date: '2025-09-02', amount: 80_000 },
    ],
  };

  it('tổng một lần đóng', () => {
    expect(contributionTotal(data.contribs[0])).toBe(150_000);
    expect(contributionTotal({ people: [] })).toBe(0);
  });

  it('fundTotals theo từng quỹ và tất cả quỹ; số dư có thể âm', () => {
    expect(fundTotals(data, 'f_a')).toEqual({ in: 150_000, out: 40_000, bal: 110_000 });
    expect(fundTotals(data, 'f_b')).toEqual({ in: 30_000, out: 80_000, bal: -50_000 });
    expect(fundTotals(data, 'all')).toEqual({ in: 180_000, out: 120_000, bal: 60_000 });
    expect(fundBalance(data, 'f_b')).toBe(-50_000);
    expect(fundTotals(data, 'khong-co')).toEqual({ in: 0, out: 0, bal: 0 });
  });

  it('tổng theo kỳ xem: tháng, năm, tất cả, tuỳ chọn (gồm cả hai đầu)', () => {
    expect(fundPeriodTotals(data, { mode: 'month', month: '2025-10' })).toEqual({ in: 150_000, out: 40_000 });
    expect(fundPeriodTotals(data, { mode: 'month', month: '2025-09' })).toEqual({ in: 30_000, out: 80_000 });
    expect(fundPeriodTotals(data, { mode: 'year', year: 2025 })).toEqual({ in: 180_000, out: 120_000 });
    expect(fundPeriodTotals(data, { mode: 'all' })).toEqual({ in: 180_000, out: 120_000 });
    expect(fundPeriodTotals(data, { mode: 'custom', from: '2025-10-05', to: '2025-10-05' })).toEqual({ in: 150_000, out: 0 });
    expect(fundPeriodTotals(data, { mode: 'month', month: '2024-01' })).toEqual({ in: 0, out: 0 });
  });

  it('sắp xếp theo giá trị tuyệt đối của số dư, quỹ âm sâu vẫn lên trước', () => {
    const rows = sortFundsByAbsBalance(data);
    expect(rows.map((r) => [r.fund.id, r.bal])).toEqual([
      ['f_a', 110_000],
      ['f_b', -50_000],
    ]);
    const deep = { ...data, expenses: [...data.expenses, { id: 'e3', fundId: 'f_b', title: 'x', date: '2025-10-01', amount: 500_000 }] };
    expect(sortFundsByAbsBalance(deep).map((r) => r.fund.id)).toEqual(['f_b', 'f_a']);
  });

  it('bằng nhau thì giữ thứ tự ban đầu', () => {
    const tie = { funds: [fundA, fundB], contribs: [], expenses: [] };
    expect(sortFundsByAbsBalance(tie).map((r) => r.fund.id)).toEqual(['f_a', 'f_b']);
  });
});

describe('phần của "Tôi" và khoản chi cá nhân cần có', () => {
  it('chỉ tính tên đúng là "Tôi" sau khi cắt khoảng trắng, cộng nhiều dòng', () => {
    expect(ownContributionTotal(contrib('c', [['Tôi', 1000], [' Tôi ', 2000], ['Tôi', 500]]))).toBe(3500);
    expect(ownContributionTotal(contrib('c', [['tôi', 1000], ['Toi', 1000], ['Tôi An', 1000], ['', 1000]]))).toBe(0);
    expect(ownContributionTotal(contrib('c', []))).toBe(0);
  });

  it('đóng quỹ nhập nghìn nhưng lưu đồng: 50 nghìn = 50.000 đồng đi thẳng sang chi tiêu cá nhân', () => {
    const want = desiredLinkedExpense(contrib('c', [['Tôi', 50_000]]), [fundA]);
    expect(want).toEqual({ a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' });
  });

  it('không có phần của "Tôi" thì không có khoản chi', () => {
    expect(desiredLinkedExpense(contrib('c', [['An', 50_000]]), [fundA])).toBeNull();
    expect(desiredLinkedExpense(contrib('c', [['Tôi', 0]]), [fundA])).toBeNull();
    expect(desiredLinkedExpense(contrib('c', [['Tôi', -5]]), [fundA])).toBeNull();
    // dưới 0,5 đồng làm tròn về 0: addExp từ chối số 0 nên không đề nghị khoản chi
    expect(desiredLinkedExpense(contrib('c', [['Tôi', 0.4]]), [fundA])).toBeNull();
  });

  it('tiêu đề trống dùng "Đóng quỹ"; thiếu quỹ thì không có hậu tố; làm tròn số tiền', () => {
    const want = desiredLinkedExpense(contrib('c', [['Tôi', 1234.6]], { title: '', fundId: 'khong-co' }), [fundA]);
    expect(want).toMatchObject({ a: 1235, n: 'Đóng quỹ', i: 'Đóng quỹ' });
  });

  it('cắt nội dung giống addExp (80 ký tự) để so sánh ổn định', () => {
    const want = desiredLinkedExpense(contrib('c', [['Tôi', 1000]], { title: 'x'.repeat(100) }), [fundA]);
    expect(want?.n).toHaveLength(80);
  });
});

// ───────────── Kế hoạch đồng bộ ─────────────

type StoreEntry = LinkedExpenseSnapshot;

/** Kho khoản chi cá nhân giả lập và bộ thực thi kế hoạch, dùng để kiểm tra kế hoạch end-to-end. */
function makeWorld(contribs: Contribution[], entries: Record<string, StoreEntry>) {
  const store = new Map<string, StoreEntry>(Object.entries(entries));
  const funds = [fundA, fundB];
  let counter = 0;
  const key = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;
  const toRef = (k: string): ExpenseRef => {
    const [m, id] = k.split('/');
    return { m, id };
  };
  const world = {
    contribs: contribs.map((c) => ({ ...c })),
    store,
    plan(): FundSyncAction[] {
      return planFundExpenseSync({
        data: { funds, contribs: world.contribs },
        lookup: (ref) => store.get(key(ref)) ?? null,
        quyRefs: [...store.entries()].filter(([, v]) => v.src === 'quy').map(([k]) => toRef(k)),
      });
    },
    apply(actions: FundSyncAction[]) {
      const byId = (id: string) => world.contribs.find((c) => c.id === id)!;
      const create = (contribId: string, expense: LinkedExpenseSnapshot) => {
        const ref = { m: expense.d.slice(0, 7), id: `n${++counter}` };
        store.set(key(ref), { ...expense });
        byId(contribId).exp = ref;
      };
      for (const action of actions) {
        if (action.type === 'add') create(action.contribId, action.expense);
        else if (action.type === 'replace') {
          if (action.remove) store.delete(key(action.remove));
          create(action.contribId, action.expense);
        } else if (action.type === 'unlink') {
          if (action.remove) store.delete(key(action.remove));
          delete byId(action.contribId).exp;
        } else store.delete(key(action.remove));
      }
    },
  };
  return world;
}

const USER = (a: number, over: Partial<StoreEntry> = {}): StoreEntry => ({ a, c: 'food', n: 'Phở', d: '2025-10-05', ...over });

describe('planFundExpenseSync', () => {
  it('lần đóng có phần của "Tôi" mà chưa có khoản chi → thêm', () => {
    const world = makeWorld([contrib('c1', [['Tôi', 50_000], ['An', 20_000]])], {});
    const plan = world.plan();
    expect(plan).toEqual([
      {
        type: 'add',
        contribId: 'c1',
        expense: { a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' },
      },
    ]);
  });

  it('lần đóng không có phần của "Tôi" và chưa có liên kết → không làm gì', () => {
    expect(makeWorld([contrib('c1', [['An', 20_000]])], {}).plan()).toEqual([]);
  });

  it('khoản liên kết đã khớp → không làm gì (kể cả khi `i` trống đối chiếu bằng chuỗi rỗng)', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const same: StoreEntry = { a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    expect(makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], { '2025-10/x1': same }).plan()).toEqual([]);
    // PWA không so sánh `src`: khoản giống hệt nhưng thiếu nhãn vẫn coi là khớp, không tạo bản trùng
    const noSrc = { ...same };
    delete noSrc.src;
    expect(makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], { '2025-10/x1': noSrc }).plan()).toEqual([]);
  });

  it('đổi số tiền → thay thế: xoá khoản cũ rồi tạo khoản mới', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const old: StoreEntry = { a: 40_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    const plan = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], { '2025-10/x1': old }).plan();
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'replace', contribId: 'c1', remove: exp, expense: { a: 50_000 } });
  });

  it('đổi tiêu đề, ngày hoặc tên quỹ cũng thay thế', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const base: StoreEntry = { a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    for (const changed of [{ n: 'Tháng 9' }, { d: '2025-10-06' }, { i: 'Đóng quỹ · Tên cũ' }, { i: undefined }]) {
      const plan = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], { '2025-10/x1': { ...base, ...changed } }).plan();
      expect(plan.map((a) => a.type)).toEqual(['replace']);
    }
  });

  it('phần của "Tôi" về 0 → bỏ liên kết và xoá khoản chi cá nhân đã tạo', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const old: StoreEntry = { a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    const plan = makeWorld([contrib('c1', [['An', 50_000]], { exp })], { '2025-10/x1': old }).plan();
    expect(plan).toEqual([{ type: 'unlink', contribId: 'c1', remove: exp }]);
  });

  it('liên kết mất khoản chi (tham chiếu treo) → tạo lại, không xoá gì', () => {
    const exp = { m: '2025-10', id: 'mat' };
    const plan = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], {}).plan();
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'replace', remove: null });
    // phần của Tôi cũng về 0 → chỉ gỡ liên kết treo
    expect(makeWorld([contrib('c1', [['An', 1]], { exp })], {}).plan()).toEqual([{ type: 'unlink', contribId: 'c1', remove: null }]);
  });

  it('KHÔNG xoá khoản chi người dùng tự nhập dù contrib.exp trỏ nhầm tới nó (chỉ bỏ liên kết)', () => {
    const exp = { m: '2025-10', id: 'user1' };
    const userEntry = USER(99_000); // không có src 'quy'
    const world = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], { '2025-10/user1': userEntry });
    const plan = world.plan();
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: 'replace', remove: null });
    world.apply(plan);
    expect(world.store.get('2025-10/user1')).toEqual(userEntry); // còn nguyên
    // và cả trường hợp phần của Tôi về 0
    const w2 = makeWorld([contrib('c1', [['An', 5]], { exp })], { '2025-10/user1': userEntry });
    const p2 = w2.plan();
    expect(p2).toEqual([{ type: 'unlink', contribId: 'c1', remove: null }]);
    w2.apply(p2);
    expect(w2.store.get('2025-10/user1')).toEqual(userEntry);
  });

  it('khoản src:"quy" không lần đóng nào trỏ tới (mồ côi) → xoá; khoản còn liên kết thì giữ', () => {
    const exp = { m: '2025-10', id: 'keep' };
    const linked: StoreEntry = { a: 50_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    const world = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], {
      '2025-10/keep': linked,
      '2025-10/orphan': { ...linked, a: 1 },
      '2025-09/orphan2': { ...linked, a: 2, d: '2025-09-01' },
    });
    const plan = world.plan();
    expect(plan).toEqual([
      { type: 'delete-orphan', remove: { m: '2025-10', id: 'orphan' } },
      { type: 'delete-orphan', remove: { m: '2025-09', id: 'orphan2' } },
    ]);
  });

  it('không bao giờ động tới khoản chi cá nhân của người dùng và khoản của Chia bill (src "cb")', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const linked: StoreEntry = { a: 40_000, c: 'fund', n: 'Tháng 10', d: '2025-10-05', i: 'Đóng quỹ · Quỹ ăn trưa', src: 'quy' };
    const mine = USER(10_000);
    const bill = USER(20_000, { c: 'bill', src: 'cb', i: 'Chia bill 05/10 · 3 người' });
    const world = makeWorld([contrib('c1', [['Tôi', 50_000]], { exp })], {
      '2025-10/x1': linked,
      '2025-10/mine': mine,
      '2025-10/bill': bill,
    });
    world.apply(world.plan());
    expect(world.store.get('2025-10/mine')).toEqual(mine);
    expect(world.store.get('2025-10/bill')).toEqual(bill);
  });

  it('bỏ trùng khoản mồ côi lặp lại trong danh sách', () => {
    const world = makeWorld([], { '2025-10/o': { a: 1, c: 'fund', n: 'n', d: '2025-10-01', src: 'quy' } });
    const ref = { m: '2025-10', id: 'o' };
    const plan = planFundExpenseSync({ data: { funds: [], contribs: [] }, lookup: () => null, quyRefs: [ref, ref] });
    expect(plan).toEqual([{ type: 'delete-orphan', remove: ref }]);
    expect(world.plan()).toHaveLength(1);
  });

  it('áp dụng kế hoạch rồi lập lại phải ra kế hoạch rỗng (đồng bộ ổn định, không xoá-tạo lặp)', () => {
    const world = makeWorld(
      [
        contrib('c1', [['Tôi', 50_000], ['An', 10_000]]),
        contrib('c2', [['Tôi', 20_000]], { fundId: 'f_b', title: '', date: '2025-09-20' }),
        contrib('c3', [['Bình', 5_000]]),
        contrib('c4', [['Tôi', 1000]], { title: 'x'.repeat(120) }),
      ],
      { '2025-10/user': USER(7_000) },
    );
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);
    expect(world.store.size).toBe(4); // 3 khoản liên kết + 1 khoản của người dùng
    expect([...world.store.values()].filter((v) => v.src === 'quy')).toHaveLength(3);
    expect(world.contribs.map((c) => !!c.exp)).toEqual([true, true, false, true]);
  });

  it('chuỗi chỉnh sửa: đổi tiền → bỏ "Tôi" → thêm lại; mỗi lần đồng bộ xong đều ổn định', () => {
    const world = makeWorld([contrib('c1', [['Tôi', 50_000]])], {});
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);

    world.contribs[0].people = [{ name: 'Tôi', amount: 80_000 }];
    const p1 = world.plan();
    expect(p1.map((a) => a.type)).toEqual(['replace']);
    world.apply(p1);
    expect(world.plan()).toEqual([]);
    expect([...world.store.values()].map((v) => v.a)).toEqual([80_000]);

    world.contribs[0].people = [{ name: 'An', amount: 80_000 }];
    const p2 = world.plan();
    expect(p2.map((a) => a.type)).toEqual(['unlink']);
    world.apply(p2);
    expect(world.plan()).toEqual([]);
    expect(world.store.size).toBe(0);
    expect(world.contribs[0].exp).toBeUndefined();

    world.contribs[0].people = [{ name: 'Tôi', amount: 10_000 }];
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);
    expect(world.store.size).toBe(1);
  });

  it('xoá lần đóng quỹ: khoản chi cá nhân liên kết trở thành mồ côi và bị xoá', () => {
    const world = makeWorld([contrib('c1', [['Tôi', 50_000]])], {});
    world.apply(world.plan());
    expect(world.store.size).toBe(1);
    world.contribs = []; // người dùng xoá lần đóng quỹ
    const plan = world.plan();
    expect(plan.map((a) => a.type)).toEqual(['delete-orphan']);
    world.apply(plan);
    expect(world.store.size).toBe(0);
  });

  it('không sửa đối tượng đầu vào', () => {
    const contribs = [contrib('c1', [['Tôi', 50_000]])];
    const copy = JSON.parse(JSON.stringify(contribs));
    planFundExpenseSync({ data: { funds: [fundA], contribs }, lookup: () => null, quyRefs: [] });
    expect(contribs).toEqual(copy);
  });
});
