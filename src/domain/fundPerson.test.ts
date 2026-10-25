import type { FundData } from '@/types/fund';

import { filterCashMovementDays, buildFundHistory } from './fundHistory';
import { buildPersonFundDetail, filterPersonDetailBySide } from './fundPerson';

// DỮ LIỆU MẪU tự tạo, không phải dữ liệu thật. Tiền là ĐỒNG.
const data: FundData = {
  funds: [{ id: 'f1', name: 'Quỹ lớp' }],
  contribs: [{ id: 'c1', fundId: 'f1', title: 'Đóng quỹ', date: '2025-10-01', people: [{ name: 'An', amount: 500_000 }, { name: 'Bình', amount: 500_000 }] }],
  expenses: [
    { id: 'x1', fundId: 'f1', title: 'Thuê sân', date: '2025-10-05', amount: 100_000 },
    { id: 'x2', fundId: 'f1', title: 'Mua nước', date: '2025-10-04', amount: 200_000, mode: 'personal', payer: 'An' },
    { id: 'x3', fundId: 'f1', title: 'In ấn', date: '2025-10-03', amount: 150_000, mode: 'advance', advanceId: 'a1', payer: 'Bình' },
    { id: 'x4', fundId: 'f1', title: 'Mua cờ', date: '2025-10-06', amount: 300_000, mode: 'personal', payer: 'An', fundPart: 120_000 },
  ],
  advances: [{ id: 'a1', fundId: 'f1', person: 'Bình', title: 'Ứng cho Bình', date: '2025-10-02', amount: 400_000 }],
  txns: [
    { id: 't1', fundId: 'f1', kind: 'refund', person: 'Bình', amount: 50_000, date: '2025-10-07', advanceId: 'a1' },
    { id: 't2', fundId: 'f1', kind: 'payout', person: 'An', amount: 80_000, date: '2025-10-08', expenseId: 'x2' },
  ],
  cur: 'f1',
};
const ALL = { mode: 'all' } as const;

describe('filterCashMovementDays (lịch sử chỉ gồm khoản làm đổi số dư thực tế)', () => {
  const history = buildFundHistory(data, 'all', ALL);
  const kept = filterCashMovementDays(history.days, data).flatMap((day) => day.entries);

  it('giữ đóng quỹ, chi trực tiếp, giao ứng (đã trừ hoàn tiền), quỹ trả; bỏ cá nhân ứng chi và chi từ tiền ứng', () => {
    expect(kept.map((entry) => entry.id).sort()).toEqual(['a1', 'c1', 't2', 'x1', 'x4']);
  });

  it('khoản chia nguồn chỉ hiện phần quỹ chi (phần làm đổi số dư thực tế)', () => {
    expect(kept.find((entry) => entry.id === 'x4')?.amount).toBe(120_000);
    expect(kept.find((entry) => entry.id === 'x1')?.amount).toBe(100_000);
  });

  it('không sửa dữ liệu gốc và bỏ ngày không còn dòng nào', () => {
    expect(history.days.flatMap((day) => day.entries)).toHaveLength(7);
    const onlyPersonal = filterCashMovementDays([{ date: '2025-10-04', entries: history.days.flatMap((d) => d.entries).filter((e) => e.id === 'x2') }], data);
    expect(onlyPersonal).toEqual([]);
  });
});

describe('buildPersonFundDetail', () => {
  it('Bình: giao ứng 400.000, chi từ ứng 150.000, hoàn 50.000', () => {
    const detail = buildPersonFundDetail(data, 'all', 'Bình');
    expect(detail).toMatchObject({ given: 400_000, spentFromAdvance: 150_000, spentPersonal: 0, refunded: 50_000, paid: 0 });
    expect(detail.items.map((item) => item.kind)).toEqual(['refund', 'advanceSpend', 'advance']);
  });

  it('An: cá nhân ứng chi (khoản chia nguồn chỉ tính phần cá nhân ứng) và quỹ đã trả', () => {
    const detail = buildPersonFundDetail(data, 'f1', 'An');
    expect(detail).toMatchObject({ given: 0, spentFromAdvance: 0, spentPersonal: 200_000 + 180_000, refunded: 0, paid: 80_000 });
  });

  it('người không có khoản nào → rỗng; quỹ khác → không lấy', () => {
    expect(buildPersonFundDetail(data, 'all', 'Chi').items).toEqual([]);
    expect(buildPersonFundDetail(data, 'f2', 'An').items).toEqual([]);
  });
});

describe('filterPersonDetailBySide — tách quỹ nợ / nợ quỹ của cùng một người', () => {
  // Người có cả hai phía: An vừa được quỹ nợ (ứng chi, quỹ trả) vừa nhận tiền ứng.
  const both: FundData = {
    ...data,
    advances: [...(data.advances ?? []), { id: 'a2', fundId: 'f1', person: 'An', title: 'Ứng cho An', date: '2025-10-02', amount: 90_000 }],
    txns: [...(data.txns ?? []), { id: 't3', fundId: 'f1', kind: 'refund', person: 'An', amount: 10_000, date: '2025-10-09', advanceId: 'a2' }],
  };
  const full = buildPersonFundDetail(both, 'f1', 'An');

  it('phía quỹ nợ chỉ có khoản cá nhân ứng chi và quỹ trả', () => {
    const owed = filterPersonDetailBySide(full, 'owed');
    expect(new Set(owed.items.map((item) => item.kind))).toEqual(new Set(['personalSpend', 'payout']));
    expect(owed.given).toBe(0);
    expect(owed.refunded).toBe(0);
    expect(owed.spentPersonal).toBe(full.spentPersonal);
    expect(owed.paid).toBe(full.paid);
  });

  it('phía nợ quỹ chỉ có tiền ứng, chi từ tiền ứng và hoàn tiền', () => {
    const held = filterPersonDetailBySide(full, 'held');
    expect(new Set(held.items.map((item) => item.kind))).toEqual(new Set(['advance', 'refund']));
    expect(held.spentPersonal).toBe(0);
    expect(held.paid).toBe(0);
    expect(held.given).toBe(90_000);
    expect(held.refunded).toBe(10_000);
  });

  it('hai phía cộng lại đủ các khoản của người đó', () => {
    expect(filterPersonDetailBySide(full, 'owed').items.length + filterPersonDetailBySide(full, 'held').items.length).toBe(full.items.length);
  });
});
