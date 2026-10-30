import type { Bill } from '@/types/bill';
import type { Pay } from '@/types/pay';

import {
  allDebts,
  canMerge,
  checkUndoMerge,
  debtEvents,
  eventLabel,
  finalizeNewPays,
  isNearZero,
  isReconciliation,
  loanLines,
  ledgerItems,
  mergeAmount,
  mergeDrafts,
  mergeHistory,
  mergeLedger,
  newMergeGroupId,
  pairDebts,
  pairNet,
  pairPaymentDraft,
  payClass,
  payLedger,
  paymentDraft,
  paymentMessage,
  personLedger,
    withoutMergeGroup,
} from './ledger';
import { roundVnd } from './money';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const bill = (id: string, date: string, createdAt: number, people: ReturnType<typeof p>[], title = id): Bill => ({ id, title, date, createdAt, cat: 'food', people });
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, ...over });

// B1: An trả 90.000 đ cho 3 người → Tôi nợ An 30.000, Bình nợ An 30.000. B2: Tôi trả 40.000 đ cho Tôi + An → An nợ tôi 20.000.
const B1 = bill('B1', '2025-10-01', 1, [p('Tôi', 0), p('An', 90_000), p('Bình', 0)]);
const B2 = bill('B2', '2025-10-03', 2, [p('Tôi', 40_000), p('An', 0)]);
const LOAN = pay('L1', 'Tôi', 'An', 50_000, { kind: 'vay', date: '2025-10-02' }); // tôi cho An vay 50.000

describe('ngưỡng và làm tròn', () => {
  it('roundVnd làm tròn từng đồng; 50 đồng là ngưỡng bằng 0', () => {
    expect(roundVnd(1000.4)).toBe(1000);
    expect(roundVnd(33_333.3)).toBe(33_333);
    expect(isNearZero(49)).toBe(true);
    expect(isNearZero(-49)).toBe(true);
    expect(isNearZero(50)).toBe(false);
    expect(isNearZero(-50)).toBe(false);
  });
});

describe('phân loại khoản trả', () => {
  it('payClass theo kind; thiếu kind thì item → vay, còn lại → bill', () => {
    expect(['bt', 'bill', 'billpay', 'vay', 'loan', 'other', 'xfer', 'repay'].map((kind) => payClass({ kind }))).toEqual(['bt', 'bill', 'bill', 'loan', 'loan', 'loan', 'loan', 'bill']);
    expect(payClass({})).toBe('bill');
    expect(payClass({ item: 'x' })).toBe('loan');
    expect(payClass({ kind: 'repay', item: 'x' })).toBe('loan');
  });

  it('gộp nợ thuộc sổ theo led; thiếu led thì có bill → bill, không → vay', () => {
    expect(mergeLedger({ led: 'loan' })).toBe('loan');
    expect(mergeLedger({ led: 'bill' })).toBe('bill');
    expect(mergeLedger({ bill: 'b1' })).toBe('bill');
    expect(mergeLedger({})).toBe('loan');
    expect(payLedger({ kind: 'bt', led: 'bill' })).toBe('bill');
    expect(payLedger({ kind: 'billpay' })).toBe('bill');
  });

  it('"Đối soát": theo cờ ds hoặc ghi chú đúng chữ', () => {
    expect(isReconciliation({ ds: 1, note: '' })).toBe(true);
    expect(isReconciliation({ note: 'Đối soát' })).toBe(true);
    expect(isReconciliation({ note: 'đối soát' })).toBe(false);
  });
});

describe('debtEvents', () => {
  it('sự kiện từ bill: tôi nợ An 30.000 (âm), An nợ tôi 20.000 (dương); Bình không liên quan đến tôi', () => {
    const events = debtEvents([B1, B2], []);
    expect(events.map((e) => [e.who, e.v, e.led, e.k, e.d])).toEqual([
      ['An', -30_000, 'bill', 'bill', '2025-10-01'],
      ['An', 20_000, 'bill', 'bill', '2025-10-03'],
    ]);
  });

  it('khoản trả: tôi trả (v dương), họ trả tôi (v âm); khoản không liên quan đến tôi hoặc số tiền ≤ 0 bị bỏ', () => {
    const events = debtEvents([], [LOAN, pay('L2', 'An', 'Tôi', 20_000, { kind: 'vay', date: '2025-10-04' }), pay('X', 'An', 'Bình', 10_000), pay('Z', 'Tôi', 'An', 0), pay('N', 'Tôi', 'An', -5000), pay('S', 'Tôi', 'Tôi', 5000)]);
    expect(events.map((e) => [e.who, e.v, e.led])).toEqual([['An', 50_000, 'loan'], ['An', -20_000, 'loan']]);
  });

  it('cắt khoảng trắng ở tên; chỉ đúng chữ "Tôi" mới là mình', () => {
    const events = debtEvents([], [pay('a', ' Tôi ', ' An ', 5000, { kind: 'vay' }), pay('b', 'tôi', 'An', 5000, { kind: 'vay' })]);
    expect(events).toHaveLength(1);
    expect(events[0].who).toBe('An');
  });

  it('xếp theo ngày rồi createdAt; bill lỗi mức cố định không sinh sự kiện', () => {
    const bad = bill('bad', '2025-10-01', 0, [{ name: 'Tôi', paid: 50_000, w: 1, fix: 40_000 } as never, { name: 'An', paid: 0, w: 1, fix: 30_000 } as never]);
    expect(debtEvents([bad], [])).toEqual([]);
    const events = debtEvents([], [pay('a', 'Tôi', 'An', 1000, { kind: 'vay', date: '2025-10-05', createdAt: 9 }), pay('b', 'Tôi', 'An', 2000, { kind: 'vay', date: '2025-10-05', createdAt: 3 }), pay('c', 'Tôi', 'An', 3000, { kind: 'vay', date: '2025-10-01', createdAt: 99 })]);
    expect(events.map((e) => e.v)).toEqual([3000, 2000, 1000]);
  });
});

describe('số dư hai sổ', () => {
  const events = debtEvents([B1, B2], [LOAN]);

  it('personLedger: nợ vay +50.000 (An nợ tôi), nợ bill −10.000 (tôi nợ An)', () => {
    const ledger = personLedger(events, 'An');
    expect(ledger).toMatchObject({ name: 'An', loan: 50_000, bill: -10_000 });
    expect(ledger.ev.loan).toHaveLength(1);
    expect(ledger.ev.bill).toHaveLength(2);
    expect(personLedger(events, ' An ').loan).toBe(50_000);
    expect(personLedger(events, 'Chi')).toMatchObject({ loan: 0, bill: 0 });
  });

  it('allDebts: danh sách lớn nhất trước, tổng người khác nợ tôi / tôi nợ', () => {
    const all = allDebts(events);
    expect(all.list.map((d) => [d.name, d.loan, d.bill])).toEqual([['An', 50_000, -10_000]]);
    expect(all.get).toBe(50_000);
    expect(all.owe).toBe(10_000);
  });

  it('người đã thanh toán xong ở cả hai sổ (dưới 50 đồng) bị ẩn; sổ lẻ vẫn tính vào tổng', () => {
    const settled = debtEvents([], [pay('a', 'Tôi', 'An', 10_000, { kind: 'vay' }), pay('b', 'An', 'Tôi', 9970, { kind: 'vay' })]);
    expect(allDebts(settled).list).toEqual([]);
    const sorted = allDebts(debtEvents([], [pay('a', 'Tôi', 'Bình', 5000, { kind: 'vay' }), pay('b', 'Tôi', 'An', 5000, { kind: 'vay' }), pay('c', 'Tôi', 'Chi', 20_000, { kind: 'vay' })]));
    expect(sorted.list.map((d) => d.name)).toEqual(['Chi', 'An', 'Bình']); // cùng độ lớn xếp theo tên
  });

  it('cộng dồn không trôi số (làm tròn từng đồng)', () => {
    const many = Array.from({ length: 10 }, (_, i) => pay(`p${i}`, 'Tôi', 'An', 100, { kind: 'vay', createdAt: i }));
    expect(personLedger(debtEvents([], many), 'An').loan).toBe(1000);
  });
});

describe('gộp nợ và hoàn tác', () => {
  const debt = { name: 'An', loan: 50_000, bill: -10_000 };

  it('chỉ gộp được khi hai sổ khác dấu và đều khác 0; số tiền là nhỏ hơn', () => {
    expect(canMerge(debt)).toBe(true);
    expect(mergeAmount(debt)).toBe(10_000);
    expect(canMerge({ loan: 50_000, bill: 20_000 })).toBe(false);
    expect(canMerge({ loan: 50_000, bill: 40 })).toBe(false);
    expect(canMerge({ loan: -5000, bill: 3000 })).toBe(true);
    expect(mergeAmount({ loan: 50_000, bill: 20_000 })).toBe(0);
    expect(mergeAmount({ loan: -5000, bill: 3000 })).toBe(3000);
  });

  it('bản nháp: họ nợ vay tôi → họ "trả" ở sổ vay và tôi "trả" ở sổ bill; ngược lại đổi chiều', () => {
    expect(mergeDrafts(debt)).toEqual([
      { kind: 'bt', led: 'loan', from: 'An', to: 'Tôi', amt: 10_000 },
      { kind: 'bt', led: 'bill', from: 'Tôi', to: 'An', amt: 10_000 },
    ]);
    expect(mergeDrafts({ name: 'An', loan: -5000, bill: 3000 })).toEqual([
      { kind: 'bt', led: 'loan', from: 'Tôi', to: 'An', amt: 3000 },
      { kind: 'bt', led: 'bill', from: 'An', to: 'Tôi', amt: 3000 },
    ]);
    expect(mergeDrafts({ name: 'An', loan: 5000, bill: 3000 })).toEqual([]);
  });

  it('sau khi gộp: nợ bill về 0, nợ vay giảm đúng số; hoàn tác trả lại số dư cũ', () => {
    const base = [B1, B2];
    const loanPays = [LOAN];
    const before = personLedger(debtEvents(base, loanPays), 'An');
    const merged = finalizeNewPays(mergeDrafts(before), { now: 1000, today: '2025-10-06', newId: (() => { let n = 0; return () => `m${++n}`; })(), group: newMergeGroupId(1000) });
    expect(merged.map((m) => m.grp)).toEqual([newMergeGroupId(1000), newMergeGroupId(1000)]);
    const after = personLedger(debtEvents(base, [...loanPays, ...merged]), 'An');
    expect(after).toMatchObject({ loan: 40_000, bill: 0 });
    const undone = personLedger(debtEvents(base, withoutMergeGroup([...loanPays, ...merged], merged[0].grp as string)), 'An');
    expect(undone).toMatchObject({ loan: 50_000, bill: -10_000 });
  });

  it('lịch sử gộp nợ: gom theo nhóm, mới nhất trước, chỉ của người đó', () => {
    const pays = [
      pay('a', 'An', 'Tôi', 10_000, { kind: 'bt', led: 'loan', grp: 'g1', createdAt: 5, date: '2025-10-06' }),
      pay('b', 'Tôi', 'An', 10_000, { kind: 'bt', led: 'bill', grp: 'g1', createdAt: 6, date: '2025-10-06' }),
      pay('c', 'Tôi', 'Bình', 7000, { kind: 'bt', led: 'loan', grp: 'g2', createdAt: 9 }),
      pay('d', 'An', 'Tôi', 4000, { kind: 'bt', led: 'loan', grp: 'g3', createdAt: 8 }),
      pay('e', 'Tôi', 'An', 4000, { kind: 'bt' }), // không có nhóm: không phải một lần gộp
    ];
    expect(mergeHistory(pays, 'An')).toEqual([
      { id: 'g3', date: '2025-10-05', createdAt: 8, loan: 4000, bill: 0 },
      { id: 'g1', date: '2025-10-06', createdAt: 5, loan: 10_000, bill: 10_000 },
    ]);
  });
});

describe('hoàn tác gộp nợ có kiểm tra giao dịch mới', () => {
  const merged = [
    LOAN,
    pay('m1', 'An', 'Tôi', 30_000, { kind: 'bt', led: 'loan', grp: 'g1', createdAt: 20 }),
    pay('m2', 'Tôi', 'An', 30_000, { kind: 'bt', led: 'bill', grp: 'g1', createdAt: 21 }),
  ];

  it('chưa có biến động nào sau lần gộp → được hoàn tác', () => {
    expect(checkUndoMerge([B1], merged, 'g1')).toEqual({ ok: true });
  });

  it('có khoản trả mới với người đó sau lần gộp → chặn, báo rõ, không âm thầm sửa', () => {
    const next = [...merged, pay('n', 'An', 'Tôi', 5000, { kind: 'vay', createdAt: 30 })];
    expect(checkUndoMerge([B1], next, 'g1')).toEqual({ ok: false, message: 'Không thể hoàn tác: đã có giao dịch mới với An sau lần gộp nợ này.' });
  });

  it('khoản mới ghi lùi ngày vẫn tính là mới (theo thời điểm tạo, không theo ngày)', () => {
    const next = [...merged, pay('n', 'Tôi', 'An', 5000, { kind: 'billpay', createdAt: 30, date: '2025-01-01' })];
    expect(checkUndoMerge([B1], next, 'g1').ok).toBe(false);
  });

  it('bill mới có An sau lần gộp → chặn', () => {
    const newBill = bill('B3', '2025-09-01', 40, [p('Tôi', 0), p('An', 20_000)]);
    expect(checkUndoMerge([B1, newBill], merged, 'g1').ok).toBe(false);
  });

  it('biến động của người khác không ảnh hưởng', () => {
    const next = [...merged, pay('n', 'Bình', 'Tôi', 5000, { kind: 'vay', createdAt: 30 })];
    expect(checkUndoMerge([B1], next, 'g1')).toEqual({ ok: true });
  });

  it('hai lần gộp liên tiếp: lần cũ bị chặn, lần mới nhất hoàn tác được (hoàn tác theo thứ tự ngược)', () => {
    const next = [
      ...merged,
      pay('m3', 'An', 'Tôi', 10_000, { kind: 'bt', led: 'loan', grp: 'g2', createdAt: 50 }),
      pay('m4', 'Tôi', 'An', 10_000, { kind: 'bt', led: 'bill', grp: 'g2', createdAt: 51 }),
    ];
    expect(checkUndoMerge([B1], next, 'g1').ok).toBe(false);
    expect(checkUndoMerge([B1], next, 'g2')).toEqual({ ok: true });
  });

  it('nhóm không tồn tại → không có gì để hoàn tác; không sửa đầu vào', () => {
    const copy = JSON.parse(JSON.stringify(merged));
    expect(checkUndoMerge([B1], merged, 'g-khong-co')).toEqual({ ok: true });
    expect(merged).toEqual(copy);
  });
});

describe('thanh toán', () => {
  it('tôi nợ (số dư âm) → tôi trả họ; họ nợ tôi (dương) → họ trả tôi; loại theo sổ', () => {
    expect(paymentDraft({ name: 'An', loan: 50_000, bill: -10_000 }, 'bill', 10_000)).toEqual({ kind: 'billpay', from: 'Tôi', to: 'An', amt: 10_000 });
    expect(paymentDraft({ name: 'An', loan: 50_000, bill: -10_000 }, 'loan', 50_000)).toEqual({ kind: 'vay', from: 'An', to: 'Tôi', amt: 50_000 });
  });

  it('một phần: nhận số tiền tuỳ ý, làm tròn từng đồng; trả dư không bị chặn (sổ đổi dấu)', () => {
    expect(paymentDraft({ name: 'An', loan: 0, bill: -10_000 }, 'bill', 4000.4)?.amt).toBe(4000);
    const draft = paymentDraft({ name: 'An', loan: 0, bill: -10_000 }, 'bill', 15_000);
    expect(draft?.amt).toBe(15_000);
    const pays = finalizeNewPays([draft!], { now: 1, today: '2025-10-06', newId: () => 'p', group: undefined });
    expect(personLedger(debtEvents([B1, B2], pays), 'An').bill).toBe(5000);
  });

  it('không có bản nháp khi số tiền ≤ 0 hoặc sổ đã hết nợ (dưới 50 đồng)', () => {
    const debt = { name: 'An', loan: 40, bill: -10_000 };
    expect(paymentDraft(debt, 'loan', 5000)).toBeNull();
    expect(paymentDraft(debt, 'bill', 0)).toBeNull();
    expect(paymentDraft(debt, 'bill', -3000)).toBeNull();
    expect(paymentDraft(debt, 'bill', NaN)).toBeNull();
  });

  it('thanh toán đủ rồi số dư về 0; câu thông báo', () => {
    const draft = paymentDraft({ name: 'An', loan: 0, bill: -10_000 }, 'bill', 10_000)!;
    expect(paymentMessage(draft)).toBe('Đã ghi Tôi → An 10.000 ₫');
    const pays = finalizeNewPays([draft], { now: 1, today: '2025-10-06', newId: () => 'p' });
    expect(personLedger(debtEvents([B1, B2], pays), 'An').bill).toBe(0);
  });

  it('finalizeNewPays: mã mới, createdAt tăng dần, ngày hôm nay, ghi chú trống, bỏ khoản làm tròn về 0 (PWA lọc sau khi làm tròn); grp chỉ cho bt', () => {
    let n = 0;
    const out = finalizeNewPays(
      [{ kind: 'vay', from: 'Tôi', to: 'An', amt: 1000.49 }, { kind: 'bt', led: 'bill', from: 'Tôi', to: 'An', amt: 2000 }, { kind: 'vay', from: 'Tôi', to: 'An', amt: 0.4 }],
      { now: 100, today: '2025-10-06', newId: () => `i${++n}`, group: 'gX' },
    );
    expect(out).toEqual([
      { kind: 'vay', from: 'Tôi', to: 'An', amt: 1000, id: 'i1', createdAt: 100, date: '2025-10-06', note: '' },
      { kind: 'bt', led: 'bill', from: 'Tôi', to: 'An', amt: 2000, id: 'i2', createdAt: 101, date: '2025-10-06', note: '', grp: 'gX' },
    ]);
  });
});

describe('nhãn dòng sổ', () => {
  const ev = (v: number, over: Record<string, unknown> = {}) => ({ led: 'loan', who: 'An', v, k: 'pay', d: '2025-10-05', c: 0, ...over }) as never;

  it('sổ vay: cho vay / chuyển / trả tùy số dư trước đó', () => {
    expect(eventLabel(ev(30000), 0)).toBe('Tôi cho An vay');
    expect(eventLabel(ev(-30000), 0)).toBe('An cho tôi vay');
    expect(eventLabel(ev(-20000), 50000)).toBe('An trả tôi');
    expect(eventLabel(ev(20000), -50000)).toBe('Tôi trả An');
    expect(eventLabel(ev(50000), -30000)).toBe('Tôi chuyển cho An'); // vượt qua 0
    expect(eventLabel(ev(-50000), 30000)).toBe('An chuyển cho tôi');
  });

  it('sổ bill, gộp nợ và bill', () => {
    expect(eventLabel(ev(10000, { led: 'bill' }), 0)).toBe('Tôi trả An');
    expect(eventLabel(ev(-10000, { led: 'bill' }), 0)).toBe('An trả tôi');
    expect(eventLabel(ev(5000, { k: 'bt' }), 0)).toBe('Gộp nợ');
    expect(eventLabel(ev(-30000, { k: 'bill', led: 'bill', bill: B1 }), 0)).toBe('B1');
  });

  it('ledgerItems: nhãn dùng số dư chạy; dòng phụ theo ghi chú / loại', () => {
    const events = debtEvents([], [pay('a', 'Tôi', 'An', 50_000, { kind: 'vay', date: '2025-10-01' }), pay('b', 'An', 'Tôi', 20_000, { kind: 'vay', date: '2025-10-02', note: 'tiền ăn' }), pay('c', 'An', 'Tôi', 40_000, { kind: 'vay', date: '2025-10-03', note: 'Trả nợ' })]);
    expect(ledgerItems(events).map((i) => [i.t, i.s, i.v])).toEqual([
      ['Tôi cho An vay', 'Chuyển tiền', 50_000],
      ['An trả tôi', 'tiền ăn', -20_000],
      ['An chuyển cho tôi', 'Chuyển tiền', -40_000], // 30.000 → −10.000: vượt qua 0
    ]);
  });
});

describe('theo cặp người trong kỳ', () => {
  it('pairDebts: cộng gợi ý chuyển của bill; Tôi nợ An 10, Bình nợ An 30; xếp "Tôi trả" trước', () => {
    expect(pairDebts([B1, B2], [], { mode: 'all' })).toEqual([
      { from: 'Tôi', to: 'An', amt: 10_000, n: 2 },
      { from: 'Bình', to: 'An', amt: 30_000, n: 1 },
    ]);
  });

  it('khoản trả sổ bill (kể cả giữa hai người khác) trừ vào cặp; cặp về 0 thì ẩn; khoản sổ vay không tính', () => {
    const pays = [pay('a', 'Bình', 'An', 30_000, { kind: 'billpay' }), pay('b', 'Tôi', 'An', 4000, { kind: 'billpay' }), pay('c', 'Tôi', 'An', 99_000, { kind: 'vay' })];
    expect(pairDebts([B1, B2], pays, { mode: 'all' })).toEqual([{ from: 'Tôi', to: 'An', amt: 6000, n: 3 }]);
  });

  it('lọc theo kỳ: tháng không có bill thì không có cặp', () => {
    expect(pairDebts([B1, B2], [], { mode: 'month', month: '2025-09' })).toEqual([]);
  });

  it('pairNet: các dòng theo thời gian, chênh lệch và chiều nợ; thanh toán cả cặp', () => {
    const net = pairNet([B1, B2], [], 'Tôi', 'An', { mode: 'all' }, () => 'Ăn uống');
    expect(net.items.map((i) => [i.s, i.t, i.x])).toEqual([[30_000, 'B1', 'Ăn uống'], [-20_000, 'B2', 'Ăn uống']]);
    expect(net).toMatchObject({ net: 10_000, from: 'Tôi', to: 'An', amt: 10_000 });
    expect(pairPaymentDraft(net)).toEqual({ kind: 'billpay', from: 'Tôi', to: 'An', amt: 10_000 });
  });

  it('pairNet đảo chiều khi An nợ tôi; chênh lệch dưới 0,05 thì không có thanh toán', () => {
    const net = pairNet([B2], [], 'Tôi', 'An', { mode: 'all' });
    expect(net).toMatchObject({ net: -20_000, from: 'An', to: 'Tôi', amt: 20_000 });
    expect(pairPaymentDraft({ from: 'A', to: 'B', amt: 40 })).toBeNull();
    expect(pairPaymentDraft({ from: 'A', to: 'B', amt: 50 })).not.toBeNull();
  });

  it('pairNet gồm khoản trả và gộp nợ thuộc sổ bill', () => {
    const pays = [pay('a', 'Tôi', 'An', 4000, { kind: 'billpay', createdAt: 20 }), pay('b', 'Tôi', 'An', 6000, { kind: 'bt', led: 'bill', createdAt: 21 }), pay('c', 'Tôi', 'An', 9000, { kind: 'bt', led: 'loan' })];
    const net = pairNet([B1, B2], pays, 'Tôi', 'An', { mode: 'all' });
    expect(net.items.slice(2).map((i) => [i.s, i.t, i.x])).toEqual([[-4000, 'Tôi trả An', 'Thanh toán bill'], [-6000, 'Gộp nợ', 'Trừ giữa nợ vay và nợ bill']]);
    expect(net.amt).toBe(0);
  });
});

describe('bảo toàn đầu vào', () => {
  it('không sửa bill và khoản trả', () => {
    const bills = [B1, B2];
    const pays = [LOAN];
    const copy = JSON.parse(JSON.stringify({ bills, pays }));
    const events = debtEvents(bills, pays);
    allDebts(events);
    personLedger(events, 'An');
    pairDebts(bills, pays, { mode: 'all' });
    pairNet(bills, pays, 'Tôi', 'An', { mode: 'all' });
    expect({ bills, pays }).toEqual(copy);
  });
});

describe('loanLines — khoản nợ vay còn hiển thị của một người', () => {
  const loan = (id: string, from: string, to: string, amt: number, date: string, note = '') => pay(id, from, to, amt, { kind: 'vay', date, note, createdAt: Number(id.replace(/\D/g, '')) || 1 });

  it('chưa tất toán lần nào: hiện đủ, cũ → mới; tiêu đề là nội dung khoản chuyển tiền, trống thì dùng nhãn mặc định', () => {
    const events = debtEvents([], [loan('1', 'Tôi', 'An', 500_000, '2025-10-01', 'Tiền thuê nhà'), loan('2', 'An', 'Tôi', 100_000, '2025-10-03')]);
    expect(loanLines(events, 'An')).toEqual([
      { date: '2025-10-01', title: 'Tiền thuê nhà', v: 500_000, id: '1' },
      { date: '2025-10-03', title: 'An trả tôi', v: -100_000, id: '2' },
    ]);
  });

  it('đã trả hết rồi phát sinh mới: chỉ hiện khoản sau lần tất toán gần nhất, các khoản cũ đã xong thì ẩn', () => {
    const events = debtEvents(
      [],
      [loan('1', 'Tôi', 'An', 300_000, '2025-10-01', 'Cũ'), loan('2', 'An', 'Tôi', 300_000, '2025-10-02'), loan('3', 'Tôi', 'An', 80_000, '2025-10-05', 'Mới'), loan('4', 'An', 'Tôi', 30_000, '2025-10-06')],
    );
    expect(loanLines(events, 'An').map((line) => line.title)).toEqual(['Mới', 'An trả tôi']);
  });

  it('đang bằng 0 (tất toán xong) thì rỗng; người khác không bị lẫn', () => {
    const events = debtEvents([], [loan('1', 'Tôi', 'An', 100_000, '2025-10-01'), loan('2', 'An', 'Tôi', 100_000, '2025-10-02'), loan('3', 'Tôi', 'Bình', 50_000, '2025-10-03', 'Bình')]);
    expect(loanLines(events, 'An')).toEqual([]);
    expect(loanLines(events, 'Bình').map((line) => line.title)).toEqual(['Bình']);
  });
});
