import type { Pay } from '@/types/pay';

import { PAY_SURPLUS_NOTE, debtPaymentMessage, planDebtPayment } from './debtPay';
import { debtEvents, finalizeNewPays, personLedger } from './ledger';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
const owe = (loan: number, bill: number) => ({ name: 'An', loan: -loan, bill: -bill }); // tôi nợ An
const get = (loan: number, bill: number) => ({ name: 'An', loan, bill }); // An nợ tôi
const brief = (drafts: ReturnType<typeof planDebtPayment>) => drafts.map((d) => [d.kind, d.from, d.to, d.amt, d.note ?? '']);

describe('planDebtPayment – điều kiện', () => {
  it('hai sổ trái dấu → không thanh toán (phải gộp nợ trước, không tự bù trừ)', () => {
    for (const option of ['bill', 'loan', 'partial', 'all'] as const) {
      expect(planDebtPayment({ name: 'An', loan: 700_000, bill: -200_000 }, option, 100_000)).toEqual([]);
    }
  });

  it('hết nợ ở cả hai sổ → không ghi gì', () => {
    for (const option of ['bill', 'loan', 'partial', 'all'] as const) {
      expect(planDebtPayment({ name: 'An', loan: 0, bill: 40 }, option, 100_000)).toEqual([]);
    }
  });
});

describe('planDebtPayment – thanh toán riêng từng sổ', () => {
  it('nợ bill: trả hết số dư bill, không đụng nợ vay', () => {
    expect(brief(planDebtPayment(owe(500_000, 300_000), 'bill'))).toEqual([['billpay', 'Tôi', 'An', 300_000, '']]);
  });

  it('nợ vay: trả hết số dư vay, không đụng nợ bill', () => {
    expect(brief(planDebtPayment(owe(500_000, 300_000), 'loan'))).toEqual([['vay', 'Tôi', 'An', 500_000, '']]);
  });

  it('họ nợ tôi: họ là người trả, tôi là người nhận', () => {
    expect(brief(planDebtPayment(get(500_000, 300_000), 'bill'))).toEqual([['billpay', 'An', 'Tôi', 300_000, '']]);
  });

  it('sổ đã về 0 thì không có gì để trả ở sổ đó', () => {
    expect(planDebtPayment(owe(0, 300_000), 'loan')).toEqual([]);
    expect(planDebtPayment(owe(500_000, 0), 'bill')).toEqual([]);
  });
});

describe('planDebtPayment – toàn bộ', () => {
  it('trả hết cả hai sổ: bill trước rồi vay, mỗi sổ một khoản đúng số dư', () => {
    expect(brief(planDebtPayment(owe(500_000, 300_000), 'all'))).toEqual([
      ['billpay', 'Tôi', 'An', 300_000, ''],
      ['vay', 'Tôi', 'An', 500_000, ''],
    ]);
  });

  it('chỉ một sổ còn nợ → một khoản', () => {
    expect(brief(planDebtPayment(owe(0, 300_000), 'all'))).toEqual([['billpay', 'Tôi', 'An', 300_000, '']]);
    expect(brief(planDebtPayment(get(500_000, 0), 'all'))).toEqual([['vay', 'An', 'Tôi', 500_000, '']]);
  });
});

describe('planDebtPayment – một phần (bill trước, rồi vay, dư thành nợ vay mới)', () => {
  const debt = owe(500_000, 300_000);

  it('nhỏ hơn nợ bill → chỉ trả bill', () => {
    expect(brief(planDebtPayment(debt, 'partial', 100_000))).toEqual([['billpay', 'Tôi', 'An', 100_000, '']]);
  });

  it('vừa đủ nợ bill → chỉ trả bill, không đụng nợ vay', () => {
    expect(brief(planDebtPayment(debt, 'partial', 300_000))).toEqual([['billpay', 'Tôi', 'An', 300_000, '']]);
  });

  it('vượt nợ bill nhưng chưa hết nợ vay → bill đủ, phần còn lại sang nợ vay', () => {
    expect(brief(planDebtPayment(debt, 'partial', 450_000))).toEqual([
      ['billpay', 'Tôi', 'An', 300_000, ''],
      ['vay', 'Tôi', 'An', 150_000, ''],
    ]);
  });

  it('vừa đủ cả hai → không có phần dư', () => {
    expect(brief(planDebtPayment(debt, 'partial', 800_000))).toEqual([
      ['billpay', 'Tôi', 'An', 300_000, ''],
      ['vay', 'Tôi', 'An', 500_000, ''],
    ]);
  });

  it('vượt tổng nợ → phần dư ghi thành nợ vay mới (bản ghi riêng, ghi chú "Trả dư")', () => {
    expect(brief(planDebtPayment(debt, 'partial', 1_000_000))).toEqual([
      ['billpay', 'Tôi', 'An', 300_000, ''],
      ['vay', 'Tôi', 'An', 500_000, ''],
      ['vay', 'Tôi', 'An', 200_000, PAY_SURPLUS_NOTE],
    ]);
    expect(PAY_SURPLUS_NOTE).toBe('Trả dư');
  });

  it('chỉ còn nợ vay → trả vay, dư thành nợ vay mới', () => {
    expect(brief(planDebtPayment(owe(500_000, 0), 'partial', 600_000))).toEqual([
      ['vay', 'Tôi', 'An', 500_000, ''],
      ['vay', 'Tôi', 'An', 100_000, PAY_SURPLUS_NOTE],
    ]);
  });

  it('chỉ còn nợ bill, trả vượt → bill đủ rồi dư sang nợ vay mới', () => {
    expect(brief(planDebtPayment(owe(0, 300_000), 'partial', 350_000))).toEqual([
      ['billpay', 'Tôi', 'An', 300_000, ''],
      ['vay', 'Tôi', 'An', 50_000, PAY_SURPLUS_NOTE],
    ]);
  });

  it('họ nợ tôi: chiều đảo lại, phần dư vẫn cùng chiều khoản trả', () => {
    expect(brief(planDebtPayment(get(500_000, 300_000), 'partial', 1_000_000))).toEqual([
      ['billpay', 'An', 'Tôi', 300_000, ''],
      ['vay', 'An', 'Tôi', 500_000, ''],
      ['vay', 'An', 'Tôi', 200_000, PAY_SURPLUS_NOTE],
    ]);
  });

  it('số tiền làm tròn từng đồng; số ≤ 0 hoặc không hợp lệ → không ghi gì', () => {
    expect(brief(planDebtPayment(debt, 'partial', 4000.4))).toEqual([['billpay', 'Tôi', 'An', 4000, '']]);
    expect(planDebtPayment(debt, 'partial', 0)).toEqual([]);
    expect(planDebtPayment(debt, 'partial', -5000)).toEqual([]);
    expect(planDebtPayment(debt, 'partial', Number.NaN)).toEqual([]);
    expect(planDebtPayment(debt, 'partial')).toEqual([]);
  });

  it('tổng các khoản ghi luôn bằng số tiền người dùng nhập (không bỏ sót phần dư)', () => {
    for (const amount of [1, 100_000, 300_000, 450_000, 800_000, 1_000_000, 1_234_567]) {
      const total = planDebtPayment(debt, 'partial', amount).reduce((sum, d) => sum + d.amt, 0);
      expect(total).toBe(amount);
    }
  });

  it('không sửa đầu vào', () => {
    const input = owe(500_000, 300_000);
    const copy = { ...input };
    planDebtPayment(input, 'partial', 1_000_000);
    expect(input).toEqual(copy);
  });
});

describe('planDebtPayment – ghi thật rồi tính lại số dư', () => {
  const base: Pay[] = [
    { id: 'a', createdAt: 1, date: '2025-10-01', note: '', from: 'An', to: 'Tôi', amt: 500_000, kind: 'vay' }, // tôi nợ An vay 500
    { id: 'b', createdAt: 2, date: '2025-10-01', note: '', from: 'An', to: 'Tôi', amt: 300_000, kind: 'billpay' }, // tôi nợ An bill 300
  ];
  const apply = (option: 'bill' | 'loan' | 'partial' | 'all', amount?: number) => {
    const debt = personLedger(debtEvents([], base), 'An');
    const drafts = planDebtPayment(debt, option, amount);
    let n = 0;
    const created = finalizeNewPays(drafts, { now: 100, today: '2025-10-06', newId: () => `n${n++}` });
    return { created, after: personLedger(debtEvents([], [...base, ...created]), 'An') };
  };

  it('ví dụ yêu cầu: trả 1.000.000 đ → bill 0, vay +200.000 (An nợ tôi 200), phần dư là bản ghi riêng', () => {
    const { created, after } = apply('partial', 1_000_000);
    expect(after).toMatchObject({ bill: 0, loan: 200_000 });
    expect(created.map((c) => [c.kind, c.amt, c.note])).toEqual([
      ['billpay', 300_000, ''],
      ['vay', 500_000, ''],
      ['vay', 200_000, 'Trả dư'],
    ]);
  });

  it('trả toàn bộ → hai sổ về 0', () => {
    expect(apply('all').after).toMatchObject({ bill: 0, loan: 0 });
  });

  it('trả riêng nợ bill → chỉ bill về 0, vay giữ nguyên; trả riêng nợ vay → ngược lại', () => {
    expect(apply('bill').after).toMatchObject({ bill: 0, loan: -500_000 });
    expect(apply('loan').after).toMatchObject({ bill: -300_000, loan: 0 });
  });

  it('trả một phần nhỏ hơn nợ bill', () => {
    expect(apply('partial', 100_000).after).toMatchObject({ bill: -200_000, loan: -500_000 });
  });
});

describe('debtPaymentMessage', () => {
  it('liệt kê từng khoản đã ghi', () => {
    const drafts = planDebtPayment(owe(500_000, 300_000), 'partial', 1_000_000);
    expect(debtPaymentMessage(drafts)).toBe('Đã ghi Tôi → An 300.000 ₫ · Tôi → An 500.000 ₫ · Tôi → An 200.000 ₫');
    expect(debtPaymentMessage([])).toBe('');
  });
});
