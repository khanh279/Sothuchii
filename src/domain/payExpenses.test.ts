import type { Bill } from '@/types/bill';
import type { ExpenseRef } from '@/types/expense';
import type { Pay } from '@/types/pay';

import type { BillSyncAction } from './bills';
import type { LinkedExpenseSnapshot } from './funds';
import { allocatePayments, planDebtExpenseSync, type DebtSyncPlan } from './payExpenses';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Sổ và khoản chi đều tính bằng ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[], title: string, cat = 'food', over: Partial<Bill> = {}): Bill => ({ id, title, date, createdAt, cat, people, ...over });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, kind: 'billpay', ...over });

// Tôi nợ An 30 (bill Ăn, 01/10, food) và 30 (bill Xem phim, 02/10, fun).
const BILLS = [
  bill('b1', '2025-10-01', 1, [p('Tôi', 0), p('An', 90_000), p('Bình', 0)], 'Ăn'),
  bill('b2', '2025-10-02', 2, [p('Tôi', 0), p('An', 60_000)], 'Xem phim', 'fun'),
];

describe('allocatePayments (nxAlloc)', () => {
  it('trả 40: trừ bill cũ nhất trước (30), phần còn lại (10) vào bill kế; đổi sang ĐỒNG', () => {
    const result = allocatePayments(BILLS, [pay('P1', 'Tôi', 'An', 40_000)]);
    expect(result).toEqual({
      P1: [
        { a: 30_000, c: 'food', n: 'Ăn', d: '2025-10-05', i: 'Trả An · bill 01/10' },
        { a: 10_000, c: 'fun', n: 'Xem phim', d: '2025-10-05', i: 'Trả An · bill 02/10' },
      ],
    });
  });

  it('nhiều lần trả nối tiếp dùng tiếp phần còn lại của bill; trả dư không sinh thêm khoản chi', () => {
    const pays = [pay('P1', 'Tôi', 'An', 40_000, { createdAt: 1 }), pay('P2', 'Tôi', 'An', 20_000, { createdAt: 2, date: '2025-10-06' }), pay('P3', 'Tôi', 'An', 50_000, { createdAt: 3, date: '2025-10-07' })];
    const result = allocatePayments(BILLS, pays);
    expect(result.P2).toEqual([{ a: 20_000, c: 'fun', n: 'Xem phim', d: '2025-10-06', i: 'Trả An · bill 02/10' }]);
    expect(result.P3).toBeUndefined(); // đã trả hết 60
  });

  it('khoản gộp nợ sổ bill dùng nhãn "Bù trừ nợ"', () => {
    const result = allocatePayments(BILLS, [pay('M', 'Tôi', 'An', 15_000, { kind: 'bt', led: 'bill', grp: 'g' })]);
    expect(result.M).toEqual([{ a: 15_000, c: 'food', n: 'Ăn', d: '2025-10-05', i: 'Bù trừ nợ An · bill 01/10' }]);
  });

  it('chỉ tính khi TÔI trả: họ trả tôi, khoản sổ vay, gộp nợ sổ vay đều không sinh khoản chi', () => {
    const pays = [pay('a', 'An', 'Tôi', 10_000), pay('b', 'Tôi', 'An', 10_000, { kind: 'vay' }), pay('c', 'Tôi', 'An', 10_000, { kind: 'bt', led: 'loan', grp: 'g' })];
    expect(allocatePayments(BILLS, pays)).toEqual({});
  });

  it('hàng đợi theo từng người: Bình chưa có bill nào tôi nợ thì trả Bình không sinh khoản chi; có bill thì chỉ dùng bill của Bình', () => {
    expect(allocatePayments(BILLS, [pay('P', 'Tôi', 'Bình', 20_000)])).toEqual({});
    const withBinh = [...BILLS, bill('b3', '2025-10-03', 3, [p('Tôi', 0), p('Bình', 40_000)], 'Cà phê')];
    const result = allocatePayments(withBinh, [pay('P', 'Tôi', 'Bình', 20_000), pay('Q', 'Tôi', 'An', 10_000, { createdAt: 11 })]);
    expect(result.P).toEqual([{ a: 20_000, c: 'food', n: 'Cà phê', d: '2025-10-05', i: 'Trả Bình · bill 03/10' }]);
    expect(result.Q).toEqual([{ a: 10_000, c: 'food', n: 'Ăn', d: '2025-10-05', i: 'Trả An · bill 01/10' }]);
  });

  it('chỉ trả vào bill diễn ra TRƯỚC hoặc cùng thời điểm theo thứ tự sự kiện (khoản trả trước bill không dùng được bill sau)', () => {
    const early = pay('E', 'Tôi', 'An', 30_000, { date: '2025-09-30' });
    expect(allocatePayments(BILLS, [early])).toEqual({});
  });

  it('phần dưới nửa đồng bị bỏ', () => {
    const tiny = [bill('t', '2025-10-01', 1, [p('Tôi', 0), p('An', 0.8)], 'Nhỏ')];
    expect(allocatePayments(tiny, [pay('P', 'Tôi', 'An', 0.4, { date: '2025-10-02' })])).toEqual({});
  });

  it('bill lỗi mức cố định không tạo nợ nên không có gì để trừ', () => {
    const bad = [bill('x', '2025-10-01', 1, [{ name: 'Tôi', paid: 50, w: 1, fix: 40 } as never, { name: 'An', paid: 0, w: 1, fix: 30 } as never], 'Lỗi')];
    expect(allocatePayments(bad, [pay('P', 'Tôi', 'An', 10_000)])).toEqual({});
  });

  it('không sửa đầu vào', () => {
    const pays = [pay('P1', 'Tôi', 'An', 40_000)];
    const copy = JSON.parse(JSON.stringify({ BILLS, pays }));
    allocatePayments(BILLS, pays);
    expect({ BILLS, pays }).toEqual(copy);
  });
});

// ───────────── Kế hoạch đồng bộ ─────────────

const key = (ref: ExpenseRef) => `${ref.m}/${ref.id}`;
const cb = (a: number, n: string, c: string, i: string, d = '2025-10-05'): LinkedExpenseSnapshot => ({ a, c, n, d, i, src: 'cb' });
const userExp = (a: number): LinkedExpenseSnapshot => ({ a, c: 'food', n: 'Phở', d: '2025-10-05' });

/** Thế giới giả lập: kho chi tiêu cá nhân + bộ thực thi kế hoạch, để kiểm tra kế hoạch end-to-end. */
function makeWorld(bills: Bill[], pays: Pay[], entries: Record<string, LinkedExpenseSnapshot>) {
  const store = new Map(Object.entries(entries));
  let counter = 0;
  const refOf = (k: string): ExpenseRef => {
    const [m, id] = k.split('/');
    return { m, id };
  };
  const world = {
    bills: bills.map((b) => ({ ...b })),
    pays: pays.map((x) => ({ ...x })),
    store,
    plan(): DebtSyncPlan {
      return planDebtExpenseSync({
        bills: world.bills,
        pays: world.pays,
        lookup: (ref) => store.get(key(ref)) ?? null,
        cbRefs: [...store.entries()].filter(([, v]) => v.src === 'cb').map(([k]) => refOf(k)),
      });
    },
    apply(plan: DebtSyncPlan) {
      const add = (e: Omit<LinkedExpenseSnapshot, 'src'> & { src?: string }): ExpenseRef => {
        const ref = { m: e.d.slice(0, 7), id: `n${++counter}` };
        store.set(key(ref), { ...e } as LinkedExpenseSnapshot);
        return ref;
      };
      for (const action of plan.bills as BillSyncAction[]) {
        const target = world.bills.find((b) => b.id === (action as { billId: string }).billId)!;
        if (action.type === 'add') target.exp = add(action.expense);
        else if (action.type === 'replace') {
          const created = add(action.expense);
          if (action.remove) store.delete(key(action.remove));
          target.exp = created;
        } else if (action.type === 'unlink') {
          if (action.remove) store.delete(key(action.remove));
          delete target.exp;
        }
      }
      for (const action of plan.pays) {
        const target = world.pays.find((x) => x.id === action.payId)!;
        if (action.type === 'replace') {
          const created = action.expenses.map(add);
          action.remove.forEach((ref) => store.delete(key(ref)));
          target.exp = created;
        } else {
          action.remove.forEach((ref) => store.delete(key(ref)));
          delete target.exp;
        }
      }
      plan.orphans.forEach((ref) => store.delete(key(ref)));
    },
  };
  return world;
}

describe('planDebtExpenseSync', () => {
  it('khoản trả mới → tạo đủ các phần chi tiêu (src "cb"), bill không có khoản chi của tôi thì không thêm', () => {
    const plan = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000)], {}).plan();
    expect(plan.bills).toEqual([]);
    expect(plan.orphans).toEqual([]);
    expect(plan.pays).toEqual([
      {
        type: 'replace',
        payId: 'P1',
        remove: [],
        expenses: [
          { a: 30_000, c: 'food', n: 'Ăn', d: '2025-10-05', i: 'Trả An · bill 01/10', src: 'cb' },
          { a: 10_000, c: 'fun', n: 'Xem phim', d: '2025-10-05', i: 'Trả An · bill 02/10', src: 'cb' },
        ],
      },
    ]);
  });

  it('danh sách đã khớp theo đúng thứ tự → không làm gì; sai thứ tự hoặc thiếu một phần → thay thế', () => {
    const exp = [{ m: '2025-10', id: 'e1' }, { m: '2025-10', id: 'e2' }];
    const entries = { '2025-10/e1': cb(30_000, 'Ăn', 'food', 'Trả An · bill 01/10'), '2025-10/e2': cb(10_000, 'Xem phim', 'fun', 'Trả An · bill 02/10') };
    expect(makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { exp })], entries).plan().pays).toEqual([]);
    const swapped = { '2025-10/e1': entries['2025-10/e2'], '2025-10/e2': entries['2025-10/e1'] };
    expect(makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { exp })], swapped).plan().pays.map((a) => a.type)).toEqual(['replace']);
    expect(makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { exp: [exp[0]] })], { '2025-10/e1': entries['2025-10/e1'] }).plan().pays.map((a) => a.type)).toEqual(['replace']);
  });

  it('sửa số tiền → xoá các khoản cũ (chỉ khoản cb) và tạo lại', () => {
    const exp = [{ m: '2025-10', id: 'e1' }, { m: '2025-10', id: 'e2' }];
    const entries = { '2025-10/e1': cb(30_000, 'Ăn', 'food', 'Trả An · bill 01/10'), '2025-10/e2': cb(10_000, 'Xem phim', 'fun', 'Trả An · bill 02/10') };
    const plan = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 20_000, { exp })], entries).plan();
    expect(plan.pays).toHaveLength(1);
    expect(plan.pays[0]).toMatchObject({ type: 'replace', remove: exp, expenses: [{ a: 20_000 }] });
    expect(plan.orphans).toEqual([]);
  });

  it('khoản trả không còn sinh chi tiêu (đã đổi sang sổ vay) → bỏ liên kết và xoá các khoản cb', () => {
    const exp = [{ m: '2025-10', id: 'e1' }];
    const plan = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { kind: 'vay', exp })], { '2025-10/e1': cb(30_000, 'Ăn', 'food', 'x') }).plan();
    expect(plan.pays).toEqual([{ type: 'unlink', payId: 'P1', remove: exp }]);
  });

  it('KHÔNG xoá khoản người dùng tự nhập dù exp trỏ nhầm tới nó; tham chiếu treo thì không có gì để xoá', () => {
    const exp = [{ m: '2025-10', id: 'user' }, { m: '2025-10', id: 'mat' }];
    const mine = userExp(77_000);
    const world = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { exp })], { '2025-10/user': mine });
    const plan = world.plan();
    expect(plan.pays[0]).toMatchObject({ type: 'replace', remove: [] });
    world.apply(plan);
    expect(world.store.get('2025-10/user')).toEqual(mine);
    const unlink = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000, { kind: 'vay', exp })], { '2025-10/user': mine }).plan();
    expect(unlink.pays).toEqual([{ type: 'unlink', payId: 'P1', remove: [] }]);
  });

  it('mồ côi: khoản cb không bill hay khoản trả nào trỏ tới bị xoá; khoản của bill và của khoản trả được giữ', () => {
    const billExp = { m: '2025-10', id: 'bx' };
    const b = bill('b3', '2025-10-04', 3, [p('Tôi', 40_000), p('Chi', 0)], 'Của tôi', 'food', { exp: billExp });
    const payExp = [{ m: '2025-10', id: 'e1' }];
    const entries = {
      '2025-10/bx': cb(20_000, 'Của tôi', 'food', 'Chia bill 04/10 · 2 người', '2025-10-04'),
      '2025-10/e1': cb(30_000, 'Ăn', 'food', 'Trả An · bill 01/10'),
      '2025-10/orphan': cb(1, 'mồ côi', 'food', 'x'),
      '2025-09/orphan2': cb(2, 'mồ côi 2', 'food', 'x', '2025-09-01'),
      '2025-10/mine': userExp(5),
      '2025-10/fund': { a: 7, c: 'fund', n: 'Quỹ', d: '2025-10-05', src: 'quy' } as LinkedExpenseSnapshot,
    };
    const plan = makeWorld([...BILLS, b], [pay('P1', 'Tôi', 'An', 30_000, { exp: payExp })], entries).plan();
    expect(plan.orphans).toEqual([{ m: '2025-10', id: 'orphan' }, { m: '2025-09', id: 'orphan2' }]);
    expect(plan.bills).toEqual([]);
    expect(plan.pays).toEqual([]);
  });

  it('mồ côi chỉ xuất hiện một lần dù lặp lại trong danh sách', () => {
    const ref = { m: '2025-10', id: 'o' };
    const plan = planDebtExpenseSync({ bills: [], pays: [], lookup: () => null, cbRefs: [ref, ref] });
    expect(plan.orphans).toEqual([ref]);
  });

  it('khoản trả không có mã thì bị bỏ qua (không liên kết được)', () => {
    expect(makeWorld(BILLS, [pay('', 'Tôi', 'An', 40_000)], {}).plan().pays).toEqual([]);
  });

  it('áp dụng kế hoạch rồi lập lại phải ra kế hoạch rỗng; khoản người dùng và "quy" giữ nguyên', () => {
    const mine = userExp(9);
    const fund = { a: 7, c: 'fund', n: 'Quỹ', d: '2025-10-05', src: 'quy' } as LinkedExpenseSnapshot;
    const own = bill('b9', '2025-10-04', 9, [p('Tôi', 40_000), p('Chi', 0)], 'Của tôi');
    const world = makeWorld([...BILLS, own], [pay('P1', 'Tôi', 'An', 40_000), pay('P2', 'Tôi', 'An', 20_000, { date: '2025-10-06' }), pay('V', 'Tôi', 'An', 5000, { kind: 'vay' })], { '2025-10/mine': mine, '2025-10/fund': fund });
    world.apply(world.plan());
    expect(world.plan()).toEqual({ bills: [], pays: [], orphans: [] });
    expect(world.store.get('2025-10/mine')).toEqual(mine);
    expect(world.store.get('2025-10/fund')).toEqual(fund);
    expect([...world.store.values()].filter((v) => v.src === 'cb')).toHaveLength(4); // 2 + 1 phần từ P1/P2 + 1 của bill
  });

  it('chuỗi chỉnh sửa: đổi số tiền → đổi sang vay → xoá khoản trả; mỗi bước ổn định, khoản chi biến mất đúng lúc', () => {
    const world = makeWorld(BILLS, [pay('P1', 'Tôi', 'An', 40_000)], {});
    world.apply(world.plan());
    expect(world.store.size).toBe(2);

    world.pays[0].amt = 20_000;
    world.apply(world.plan());
    expect(world.plan()).toEqual({ bills: [], pays: [], orphans: [] });
    expect([...world.store.values()].map((v) => v.a)).toEqual([20_000]);

    world.pays[0].kind = 'vay';
    world.apply(world.plan());
    expect(world.plan()).toEqual({ bills: [], pays: [], orphans: [] });
    expect(world.store.size).toBe(0);

    world.pays[0].kind = 'billpay';
    world.apply(world.plan());
    expect(world.store.size).toBe(1);
    world.pays = [];
    const plan = world.plan();
    expect(plan.orphans).toHaveLength(1);
    world.apply(plan);
    expect(world.store.size).toBe(0);
  });

  it('không sửa đầu vào', () => {
    const pays = [pay('P1', 'Tôi', 'An', 40_000)];
    const copy = JSON.parse(JSON.stringify({ BILLS, pays }));
    planDebtExpenseSync({ bills: BILLS, pays, lookup: () => null, cbRefs: [] });
    expect({ BILLS, pays }).toEqual(copy);
  });
});
