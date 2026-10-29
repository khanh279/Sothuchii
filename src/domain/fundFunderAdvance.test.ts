import type { Advance, FundExpense, FundTxn } from '@/types/fund';

import { advanceSummary, checkPayout, fundPersonBalances, fundPersonTargets, fundPosition, planAdvanceRefund } from './fundAdvance';
import { buildPersonFundDetail } from './fundPerson';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền: ĐỒNG. Quỹ HẾT TIỀN: An ứng 100.000 cho Bình chi hộ.
const F = 'f1';
const advance: Advance = { id: 'a1', fundId: F, person: 'Bình', funder: 'An', title: '', date: '2025-10-03', amount: 100_000 };
const spend = (amount: number): FundExpense => ({ id: 'e1', fundId: F, title: 'Thuê sân', date: '2025-10-04', amount, mode: 'advance', payer: 'Bình', advanceId: 'a1' });
const refund = (amount: number): FundTxn => ({ id: 't1', fundId: F, kind: 'refund', person: 'Bình', amount, date: '2025-10-05', advanceId: 'a1' });
const payoutAn = (amount: number): FundTxn => ({ id: 't2', fundId: F, kind: 'payout', person: 'An', amount, date: '2025-10-06', advanceId: 'a1' });
const data = (over: Partial<{ expenses: FundExpense[]; txns: FundTxn[] }> = {}) => ({ contribs: [], expenses: [], advances: [advance], txns: [], ...over });

describe('cá nhân ứng tiền cho người khác chi (quỹ hết tiền)', () => {
  it('chưa chi: quỹ nợ An đủ 100.000, Bình giữ 100.000, tiền mặt quỹ vẫn 0', () => {
    expect(fundPosition(data(), F)).toMatchObject({ cash: 0, owed: 100_000, held: 100_000, balance: 0 });
    expect(fundPersonBalances(data(), F)).toEqual([
      { person: 'An', owed: 100_000, held: 0 },
      { person: 'Bình', owed: 0, held: 100_000 },
    ]);
  });

  it('Bình chi 60.000: Bình còn nợ quỹ 40.000; quỹ nợ An 100.000 − 40.000 = 60.000 = số đã chi (ròng)', () => {
    const d = data({ expenses: [spend(60_000)] });
    const p = fundPosition(d, F);
    expect(p).toMatchObject({ cash: 0, held: 40_000, owed: 100_000, balance: -60_000 });
    expect(p.owed - p.held).toBe(60_000);
    expect(advanceSummary(d, advance)).toMatchObject({ held: 40_000, funderOwed: 100_000 });
  });

  it('Bình hoàn 40.000 thừa vào quỹ → quỹ có tiền mặt 40.000; trả An được và công nợ An giảm; không trả quá tiền mặt', () => {
    const d = data({ expenses: [spend(60_000)], txns: [refund(40_000)] });
    expect(fundPosition(d, F)).toMatchObject({ cash: 40_000, held: 0, owed: 100_000 });
    expect(checkPayout(d, { advanceId: 'a1', toFunder: true }, 50_000)).toMatchObject({ ok: false });
    expect(checkPayout(d, { advanceId: 'a1', toFunder: true }, 40_000)).toEqual({ ok: true, amount: 40_000 });
    const paid = data({ expenses: [spend(60_000)], txns: [refund(40_000), payoutAn(40_000)] });
    expect(fundPosition(paid, F)).toMatchObject({ cash: 0, owed: 60_000 });
    expect(advanceSummary(paid, advance)).toMatchObject({ funderOwed: 60_000, paidExtra: 0, held: 0 });
  });

  it('khoản trả An xuất hiện ở danh sách thanh toán của An; Bình chỉ có khoản hoàn', () => {
    const d = data({ expenses: [spend(60_000)] });
    expect(fundPersonTargets(d, F, 'An')).toMatchObject([{ kind: 'payout', toFunder: true, advanceId: 'a1', remaining: 100_000 }]);
    expect(fundPersonTargets(d, F, 'Bình')).toMatchObject([{ kind: 'refund', advanceId: 'a1', remaining: 40_000 }]);
  });

  it('hoàn hết tiền ứng chưa chi không xoá hồ sơ (quỹ vẫn nợ An)', () => {
    expect(planAdvanceRefund(data(), F, 'Bình', 100_000)).toEqual([{ advanceId: 'a1', amount: 100_000 }]);
  });

  it('chi trang chi tiết người: An có dòng "Cá nhân ứng cho người khác chi", Bình có dòng giao ứng', () => {
    const d = data();
    expect(buildPersonFundDetail(d, F, 'An').items).toMatchObject([{ kind: 'funded', amount: 100_000 }]);
    expect(buildPersonFundDetail(d, F, 'Bình').items).toMatchObject([{ kind: 'advance', amount: 100_000 }]);
  });
});
