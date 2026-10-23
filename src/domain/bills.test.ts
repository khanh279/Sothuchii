import type { Bill } from '@/types/bill';
import type { ExpenseRef } from '@/types/expense';

import {
  BILL_OWNER_NAME,
  canSaveBill,
  computeSplit,
  defaultPersonName,
  describeSplitProblem,
  desiredBillExpense,
  fixedOf,
  normalizeBills,
  planBillExpenseSync,
  suggestTransfers,
  weightOf,
  type BillSyncAction,
} from './bills';
import type { LinkedExpenseSnapshot } from './funds';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền của bill là ĐỒNG.
const p = (name: string, paid: number, extra: { w?: number; fix?: number } = {}) => ({ name, paid, ...extra });
const sumShares = (rows: { share: number }[]) => rows.reduce((s, r) => s + r.share, 0);

describe('hệ số và mức cố định', () => {
  it('hệ số: thiếu/rỗng/âm/không hợp lệ là 1; 0 hợp lệ', () => {
    expect(weightOf({})).toBe(1);
    expect(weightOf(null)).toBe(1);
    expect(weightOf({ w: 2.5 })).toBe(2.5);
    expect(weightOf({ w: 0 })).toBe(0);
    expect(weightOf({ w: -1 })).toBe(1);
    expect(weightOf({ w: NaN })).toBe(1);
    expect(weightOf({ w: '' as unknown as number })).toBe(1);
  });

  it('mức cố định: thiếu/rỗng/âm là null; 0 là mức cố định hợp lệ', () => {
    expect(fixedOf({})).toBeNull();
    expect(fixedOf({ fix: undefined })).toBeNull();
    expect(fixedOf({ fix: '' as unknown as number })).toBeNull();
    expect(fixedOf({ fix: -5 })).toBeNull();
    expect(fixedOf({ fix: 0 })).toBe(0);
    expect(fixedOf({ fix: 30_000 })).toBe(30_000);
  });

  it('tên mặc định: người đầu là "Tôi", sau đó B, C, ...', () => {
    expect([0, 1, 2, 19].map(defaultPersonName)).toEqual(['Tôi', 'B', 'C', 'T']);
  });
});

describe('computeSplit', () => {
  it('chia đều: 100.000 đ cho 3 người, một người trả hết', () => {
    const s = computeSplit([p('Tôi', 100_000), p('B', 0), p('C', 0)]);
    expect(s).toMatchObject({ n: 3, total: 100_000, even: true, bad: '', sumFix: 0 });
    expect(s.share).toBeCloseTo(100_000 / 3, 6);
    expect(sumShares(s.rows)).toBeCloseTo(100_000, 6);
    expect(s.rows[0]).toMatchObject({ paid: 100_000, fixed: false, w: 1 });
    expect(s.rows[0].net).toBeCloseTo(100_000 - 100_000 / 3, 6);
  });

  it('gợi ý chuyển tiền chính xác đến đồng và dồn phần dư vào người lệch nhiều nhất', () => {
    const s = computeSplit([p('Tôi', 100_000), p('B', 0), p('C', 0)]);
    // 66667 - 1 (dư) = 66666 đồng; hai người nợ 33333 đồng mỗi người
    expect(s.transfers).toEqual([
      { from: 'B', to: 'Tôi', amt: 33_333 },
      { from: 'C', to: 'Tôi', amt: 33_333 },
    ]);
  });

  it('hệ số: 90.000 đ, hệ số 2 và 1 → 60 và 30; không còn là chia đều', () => {
    const s = computeSplit([p('Tôi', 90_000, { w: 2 }), p('B', 0, { w: 1 })]);
    expect(s.even).toBe(false);
    expect(s.share).toBe(30_000); // giá trị một phần
    expect(s.rows.map((r) => r.share)).toEqual([60_000, 30_000]);
    expect(s.rows.map((r) => r.w)).toEqual([2, 1]);
    expect(s.transfers).toEqual([{ from: 'B', to: 'Tôi', amt: 30_000 }]);
  });

  it('mức cố định: người cố định trả đúng mức, phần còn lại chia cho người khác', () => {
    const s = computeSplit([p('Tôi', 100_000), p('B', 0, { fix: 30_000 }), p('C', 0)]);
    expect(s.sumFix).toBe(30_000);
    expect(s.rows.map((r) => [r.share, r.fixed])).toEqual([[35_000, false], [30_000, true], [35_000, false]]);
    expect(s.even).toBe(false);
    expect(s.bad).toBe('');
  });

  it('mức cố định 0 là hợp lệ (người đó không phải trả)', () => {
    const s = computeSplit([p('Tôi', 60_000), p('B', 0, { fix: 0 }), p('C', 0)]);
    expect(s.rows.map((r) => r.share)).toEqual([30_000, 0, 30_000]);
  });

  it('mức cố định đè hệ số của người đó (hệ số coi là 1)', () => {
    const s = computeSplit([p('A', 100_000, { w: 5, fix: 20_000 }), p('B', 0, { w: 2 })]);
    expect(s.rows[0]).toMatchObject({ share: 20_000, w: 1, fixed: true });
    expect(s.rows[1].share).toBe(80_000);
  });

  it('tổng hệ số bằng 0 thì chia đều và hệ số hiển thị là 1', () => {
    const s = computeSplit([p('A', 60_000, { w: 0 }), p('B', 0, { w: 0 })]);
    expect(s.rows.map((r) => [r.share, r.w])).toEqual([[30_000, 1], [30_000, 1]]);
    expect(s.even).toBe(true);
  });

  it("lỗi 'over': tổng mức cố định lớn hơn tổng bill → không gợi ý chuyển", () => {
    const s = computeSplit([p('A', 50_000, { fix: 40_000 }), p('B', 0, { fix: 30_000 }), p('C', 0)]);
    expect(s.bad).toBe('over');
    expect(s.transfers).toEqual([]);
    expect(canSaveBill(s)).toBe(false);
    expect(describeSplitProblem(s)).toBe('Tổng mức cố định (70.000 ₫) lớn hơn tổng bill (50.000 ₫).');
  });

  it("lỗi 'gap': ai cũng cố định nhưng cộng lại khác tổng bill", () => {
    const s = computeSplit([p('A', 100_000, { fix: 30_000 }), p('B', 0, { fix: 30_000 })]);
    expect(s.bad).toBe('gap');
    expect(describeSplitProblem(s)).toBe('Ai cũng trả mức cố định nhưng cộng lại (60.000 ₫) khác tổng bill (100.000 ₫).');
  });

  it('ai cũng cố định và cộng đúng tổng bill thì hợp lệ; sai số dưới 50 đồng bỏ qua', () => {
    expect(computeSplit([p('A', 100_000, { fix: 60_000 }), p('B', 0, { fix: 40_000 })]).bad).toBe('');
    expect(computeSplit([p('A', 100_000, { fix: 60_000 }), p('B', 0, { fix: 39_970 })]).bad).toBe('');
    expect(computeSplit([p('A', 100_000, { fix: 60_000 }), p('B', 0, { fix: 39_900 })]).bad).toBe('gap');
  });

  it('điều kiện lưu: có tiền, ít nhất 2 người, không lỗi', () => {
    expect(canSaveBill(computeSplit([p('Tôi', 0), p('B', 0)]))).toBe(false);
    expect(canSaveBill(computeSplit([p('Tôi', 50_000)]))).toBe(false);
    expect(canSaveBill(computeSplit([p('Tôi', 50_000), p('B', 0)]))).toBe(true);
  });

  it('danh sách rỗng không lỗi', () => {
    expect(computeSplit([])).toMatchObject({ n: 0, total: 0, share: 0, rows: [], transfers: [], bad: '' });
  });

  it('dữ liệu paid không hợp lệ coi là 0', () => {
    const s = computeSplit([{ name: 'A', paid: 'x' as unknown as number }, p('B', 10_000)]);
    expect(s.total).toBe(10_000);
  });

  it('không sửa mảng đầu vào', () => {
    const people = [p('A', 10_000), p('B', 0)];
    const copy = JSON.parse(JSON.stringify(people));
    computeSplit(people);
    expect(people).toEqual(copy);
  });
});

describe('suggestTransfers', () => {
  it('mọi người đều bằng nhau thì không có khoản chuyển', () => {
    expect(suggestTransfers([{ name: 'A', net: 0 }, { name: 'B', net: 0 }])).toEqual([]);
  });

  it('ghép người thiếu lớn nhất với người nhận lại lớn nhất; tổng chuyển bằng tổng nhận', () => {
    const rows = [
      { name: 'A', net: 50_000 },
      { name: 'B', net: 10_000 },
      { name: 'C', net: -45_000 },
      { name: 'D', net: -15_000 },
    ];
    const t = suggestTransfers(rows);
    expect(t).toEqual([
      { from: 'C', to: 'A', amt: 45_000 },
      { from: 'D', to: 'A', amt: 5000 },
      { from: 'D', to: 'B', amt: 10_000 },
    ]);
    expect(t.reduce((s, x) => s + x.amt, 0)).toBe(60_000);
  });

  it('mọi số tiền chuyển là số đồng nguyên', () => {
    const s = computeSplit([p('A', 100_000), p('B', 0), p('C', 0), p('D', 0), p('E', 0), p('F', 0), p('G', 0)]);
    for (const t of s.transfers) expect(Number.isInteger(t.amt)).toBe(true);
  });
});

describe('khoản chi cá nhân của bill (đơn vị đồng)', () => {
  const bill = (people: ReturnType<typeof p>[], over: Partial<Bill> = {}) => ({
    title: 'Ăn trưa',
    date: '2025-10-05',
    cat: 'food',
    people,
    ...over,
  });

  it('"Tôi" trả hết 100.000 đ cho 3 người → khoản chi bằng phần của mình', () => {
    const want = desiredBillExpense(bill([p('Tôi', 100_000), p('B', 0), p('C', 0)]));
    expect(want).toEqual({ a: 33333, c: 'food', n: 'Ăn trưa', d: '2025-10-05', i: 'Chia bill 05/10 · 3 người', src: 'cb' });
  });

  it('150.000 đ của "Tôi", phần 50.000 đ → 50.000 đồng (không nhân thêm)', () => {
    expect(desiredBillExpense(bill([p('Tôi', 150_000), p('B', 0), p('C', 0)]))?.a).toBe(50_000);
  });

  it('"Tôi" trả ít hơn phần mình → lấy số đã trả và ghi "Trả trước"', () => {
    const want = desiredBillExpense(bill([p('Tôi', 20_000), p('B', 70_000)]));
    expect(want).toMatchObject({ a: 20_000, i: 'Chia bill 05/10 · 2 người\nTrả trước 20.000 ₫' });
  });

  it('"Tôi" chưa trả đồng nào → không có khoản chi', () => {
    expect(desiredBillExpense(bill([p('Tôi', 0), p('B', 90_000)]))).toBeNull();
  });

  it('chỉ tên đúng "Tôi" mới tính; "tôi" hay "Tôi " thì không', () => {
    expect(BILL_OWNER_NAME).toBe('Tôi');
    expect(desiredBillExpense(bill([p('tôi', 100_000), p('B', 0)]))).toBeNull();
    expect(desiredBillExpense(bill([p('Tôi ', 100_000), p('B', 0)]))).toBeNull();
    expect(desiredBillExpense(bill([p('A', 100_000), p('B', 0)]))).toBeNull();
  });

  it('bill lỗi mức cố định → không có khoản chi', () => {
    expect(desiredBillExpense(bill([p('Tôi', 50_000, { fix: 40_000 }), p('B', 0, { fix: 30_000 })]))).toBeNull();
  });

  it('phần dưới nửa đồng làm tròn về 0 → không có khoản chi', () => {
    expect(desiredBillExpense(bill([p('Tôi', 0.4), p('B', 0.4)]))).toBeNull();
  });

  it('tiêu đề trống → "Không tên"; mục trống → "other"; cắt 80 ký tự giống addExp', () => {
    const w = desiredBillExpense(bill([p('Tôi', 10_000), p('B', 10_000)], { title: '', cat: '' }));
    expect(w).toMatchObject({ n: 'Không tên', c: 'other' });
    expect(desiredBillExpense(bill([p('Tôi', 10_000), p('B', 10_000)], { title: 'x'.repeat(120) }))?.n).toHaveLength(80);
  });

  it('theo mức cố định: người cố định 40.000 đ, đã trả 100.000 đ → khoản chi 40.000 đồng', () => {
    expect(desiredBillExpense(bill([p('Tôi', 100_000, { fix: 40_000 }), p('B', 0)]))?.a).toBe(40_000);
  });
});

describe('normalizeBills (chỉ đọc v2)', () => {
  it('bỏ mục không phải bill, điền mặc định, đọc exp, bỏ qua trường cũ', () => {
    const raw = [
      { id: 'b1', date: '2025-10-05', createdAt: 5, people: [{ name: 'Tôi', paid: '100000' }, { name: 'B', paid: 0, w: 2, fix: 7000 }], exp: { m: '2025-10', id: 'x' }, settled: true },
      { id: 'b2', people: [] },
      { id: 'b3', people: 'sai' },
      { title: 'khong id', people: [] },
      null,
      'rác',
    ];
    const bills = normalizeBills(raw, { today: '2025-12-01' });
    expect(bills).toHaveLength(2);
    expect(bills[0]).toEqual({
      id: 'b1',
      title: 'Không tên',
      date: '2025-10-05',
      createdAt: 5,
      cat: 'other',
      people: [{ name: 'Tôi', paid: 100_000 }, { name: 'B', paid: 0, w: 2, fix: 7000 }],
      exp: { m: '2025-10', id: 'x' },
    });
    expect(bills[1]).toMatchObject({ id: 'b2', date: '2025-12-01', people: [] });
    expect(bills[1]).not.toHaveProperty('exp');
  });

  it('không phải mảng → rỗng; không sửa đầu vào', () => {
    expect(normalizeBills(undefined)).toEqual([]);
    expect(normalizeBills({})).toEqual([]);
    const raw = [{ id: 'b1', people: [{ name: 'A', paid: 1 }] }];
    const copy = JSON.parse(JSON.stringify(raw));
    normalizeBills(raw);
    expect(raw).toEqual(copy);
  });
});

// ───────────── Kế hoạch đồng bộ ─────────────

/** Kho khoản chi cá nhân giả lập và bộ thực thi kế hoạch để kiểm tra kế hoạch end-to-end. */
function makeWorld(bills: Bill[], entries: Record<string, LinkedExpenseSnapshot>, others: ExpenseRef[] = []) {
  const store = new Map(Object.entries(entries));
  let counter = 0;
  const key = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;
  const toRef = (k: string): ExpenseRef => {
    const [m, id] = k.split('/');
    return { m, id };
  };
  const world = {
    bills: bills.map((b) => ({ ...b })),
    store,
    plan(): BillSyncAction[] {
      return planBillExpenseSync({
        bills: world.bills,
        lookup: (ref) => store.get(key(ref)) ?? null,
        cbRefs: [...store.entries()].filter(([, v]) => v.src === 'cb').map(([k]) => toRef(k)),
        otherReferenced: others,
      });
    },
    apply(actions: BillSyncAction[]) {
      const byId = (id: string) => world.bills.find((b) => b.id === id)!;
      const create = (billId: string, expense: LinkedExpenseSnapshot) => {
        const ref = { m: expense.d.slice(0, 7), id: `n${++counter}` };
        store.set(key(ref), { ...expense });
        byId(billId).exp = ref;
      };
      for (const action of actions) {
        if (action.type === 'add') create(action.billId, action.expense);
        else if (action.type === 'replace') {
          if (action.remove) store.delete(key(action.remove));
          create(action.billId, action.expense);
        } else if (action.type === 'unlink') {
          if (action.remove) store.delete(key(action.remove));
          delete byId(action.billId).exp;
        } else store.delete(key(action.remove));
      }
    },
  };
  return world;
}

const mkBill = (id: string, people: ReturnType<typeof p>[], over: Partial<Bill> = {}): Bill => ({
  id,
  title: 'Ăn trưa',
  date: '2025-10-05',
  createdAt: 1,
  cat: 'food',
  people,
  ...over,
});
const userExp = (a: number, over: Partial<LinkedExpenseSnapshot> = {}): LinkedExpenseSnapshot => ({ a, c: 'food', n: 'Phở', d: '2025-10-05', ...over });
const expected: LinkedExpenseSnapshot = { a: 33333, c: 'food', n: 'Ăn trưa', d: '2025-10-05', i: 'Chia bill 05/10 · 3 người', src: 'cb' };
const three = [p('Tôi', 100_000), p('B', 0), p('C', 0)];

describe('planBillExpenseSync', () => {
  it('bill có phần của "Tôi" mà chưa có khoản chi → thêm', () => {
    const plan = makeWorld([mkBill('b1', three)], {}).plan();
    expect(plan).toEqual([{ type: 'add', billId: 'b1', expense: { ...expected, src: 'cb' } }]);
  });

  it('bill không có phần của "Tôi" và chưa liên kết → không làm gì', () => {
    expect(makeWorld([mkBill('b1', [p('A', 100_000), p('B', 0)])], {}).plan()).toEqual([]);
  });

  it('khoản liên kết đã khớp → không làm gì, kể cả khi thiếu `src`', () => {
    const exp = { m: '2025-10', id: 'x1' };
    expect(makeWorld([mkBill('b1', three, { exp })], { '2025-10/x1': expected }).plan()).toEqual([]);
    const noSrc = { ...expected };
    delete noSrc.src;
    expect(makeWorld([mkBill('b1', three, { exp })], { '2025-10/x1': noSrc }).plan()).toEqual([]);
  });

  it('đổi số tiền, tiêu đề, ngày, mục, số người → thay thế (xoá cũ, tạo mới)', () => {
    const exp = { m: '2025-10', id: 'x1' };
    for (const changed of [{ a: 1 }, { n: 'Cũ' }, { d: '2025-10-06' }, { c: 'fun' }, { i: 'Chia bill 05/10 · 2 người' }, { i: undefined }]) {
      const plan = makeWorld([mkBill('b1', three, { exp })], { '2025-10/x1': { ...expected, ...changed } }).plan();
      expect(plan.map((a) => a.type)).toEqual(['replace']);
      expect(plan[0]).toMatchObject({ remove: exp });
    }
  });

  it('"Tôi" không còn phần → bỏ liên kết và xoá khoản chi đã tạo', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const plan = makeWorld([mkBill('b1', [p('A', 100_000), p('B', 0)], { exp })], { '2025-10/x1': expected }).plan();
    expect(plan).toEqual([{ type: 'unlink', billId: 'b1', remove: exp }]);
  });

  it('tham chiếu treo → tạo lại, không xoá gì; hết phần của "Tôi" thì chỉ gỡ liên kết treo', () => {
    const exp = { m: '2025-10', id: 'mat' };
    const plan = makeWorld([mkBill('b1', three, { exp })], {}).plan();
    expect(plan[0]).toMatchObject({ type: 'replace', remove: null });
    expect(makeWorld([mkBill('b1', [p('A', 1000), p('B', 0)], { exp })], {}).plan()).toEqual([{ type: 'unlink', billId: 'b1', remove: null }]);
  });

  it('KHÔNG xoá khoản người dùng tự nhập dù bill.exp trỏ nhầm tới nó', () => {
    const exp = { m: '2025-10', id: 'user1' };
    const mine = userExp(99_000);
    const world = makeWorld([mkBill('b1', three, { exp })], { '2025-10/user1': mine });
    const plan = world.plan();
    expect(plan[0]).toMatchObject({ type: 'replace', remove: null });
    world.apply(plan);
    expect(world.store.get('2025-10/user1')).toEqual(mine);

    const w2 = makeWorld([mkBill('b1', [p('A', 1000), p('B', 0)], { exp })], { '2025-10/user1': mine });
    const p2 = w2.plan();
    expect(p2).toEqual([{ type: 'unlink', billId: 'b1', remove: null }]);
    w2.apply(p2);
    expect(w2.store.get('2025-10/user1')).toEqual(mine);
  });

  it('khoản src:"cb" mồ côi bị xoá; khoản còn liên kết và khoản dữ liệu khác đang dùng thì giữ', () => {
    const exp = { m: '2025-10', id: 'keep' };
    const world = makeWorld(
      [mkBill('b1', three, { exp })],
      {
        '2025-10/keep': expected,
        '2025-10/orphan': { ...expected, a: 1 },
        '2025-09/orphan2': { ...expected, a: 2, d: '2025-09-01' },
        '2025-10/payment': { ...expected, a: 3, n: 'Trả nợ' },
      },
      [{ m: '2025-10', id: 'payment' }],
    );
    expect(world.plan()).toEqual([
      { type: 'delete-orphan', remove: { m: '2025-10', id: 'orphan' } },
      { type: 'delete-orphan', remove: { m: '2025-09', id: 'orphan2' } },
    ]);
  });

  it('không bao giờ động tới khoản chi của người dùng và khoản của Quỹ (src "quy")', () => {
    const exp = { m: '2025-10', id: 'x1' };
    const mine = userExp(10_000);
    const fund = userExp(20_000, { c: 'fund', src: 'quy', i: 'Đóng quỹ · A' });
    const world = makeWorld([mkBill('b1', three, { exp })], { '2025-10/x1': { ...expected, a: 1 }, '2025-10/mine': mine, '2025-10/fund': fund });
    world.apply(world.plan());
    world.bills = []; // xoá bill
    world.apply(world.plan());
    expect(world.store.get('2025-10/mine')).toEqual(mine);
    expect(world.store.get('2025-10/fund')).toEqual(fund);
    expect([...world.store.keys()].sort()).toEqual(['2025-10/fund', '2025-10/mine']);
  });

  it('bỏ trùng khoản mồ côi lặp lại', () => {
    const ref = { m: '2025-10', id: 'o' };
    const plan = planBillExpenseSync({ bills: [], lookup: () => null, cbRefs: [ref, ref] });
    expect(plan).toEqual([{ type: 'delete-orphan', remove: ref }]);
  });

  it('áp dụng kế hoạch rồi lập lại phải ra kế hoạch rỗng (ổn định, không xoá-tạo lặp)', () => {
    const world = makeWorld(
      [
        mkBill('b1', three),
        mkBill('b2', [p('Tôi', 20_000), p('B', 70_000)], { date: '2025-09-20', title: '' }),
        mkBill('b3', [p('A', 100_000), p('B', 0)]),
        mkBill('b4', [p('Tôi', 10_000), p('B', 10_000)], { title: 'x'.repeat(120) }),
      ],
      { '2025-10/user': userExp(7_000) },
    );
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);
    expect([...world.store.values()].filter((v) => v.src === 'cb')).toHaveLength(3);
    expect(world.store.size).toBe(4);
    expect(world.bills.map((b) => !!b.exp)).toEqual([true, true, false, true]);
  });

  it('chuỗi chỉnh sửa: đổi tiền → bỏ "Tôi" → thêm lại → xoá bill; mỗi bước đồng bộ xong đều ổn định', () => {
    const world = makeWorld([mkBill('b1', three)], {});
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);

    world.bills[0].people = [p('Tôi', 150_000), p('B', 0), p('C', 0)];
    const p1 = world.plan();
    expect(p1.map((a) => a.type)).toEqual(['replace']);
    world.apply(p1);
    expect(world.plan()).toEqual([]);
    expect([...world.store.values()].map((v) => v.a)).toEqual([50_000]);

    world.bills[0].people = [p('A', 150_000), p('B', 0)];
    world.apply(world.plan());
    expect(world.plan()).toEqual([]);
    expect(world.store.size).toBe(0);
    expect(world.bills[0].exp).toBeUndefined();

    world.bills[0].people = three;
    world.apply(world.plan());
    expect(world.store.size).toBe(1);

    world.bills = [];
    const del = world.plan();
    expect(del.map((a) => a.type)).toEqual(['delete-orphan']);
    world.apply(del);
    expect(world.store.size).toBe(0);
  });

  it('không sửa đầu vào', () => {
    const bills = [mkBill('b1', three)];
    const copy = JSON.parse(JSON.stringify(bills));
    planBillExpenseSync({ bills, lookup: () => null, cbRefs: [] });
    expect(bills).toEqual(copy);
  });
});
