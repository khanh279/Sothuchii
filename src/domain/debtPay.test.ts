import type { Pay } from '@/types/pay';

import { PAY_SURPLUS_NOTE, debtPaymentMessage, planDebtPayment } from './debtPay';
import { debtEvents, finalizeNewPays, personLedger } from './ledger';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
const owe = (loan: number, bill: number) => ({ name: 'An', loan: -loan, bill: -bill }); // tôi nợ An
const get = (loan: number, bill: number) => ({ name: 'An', loan, bill }); // An nợ tôi
const brief = (drafts: ReturnType<typeof planDebtPayment>) => drafts.map((d) => [d.kind, d.from, d.to, d.amt, d.note ?? '']);

describe('planDebtPayment – điều kiện', () => {
  it('hai sổ trái dấu → không thanh toán (phải gộp nợ trước, không tự bù trừ)', () => {
    for (const option of ['bill', 'loan', 'partial', 'all'] as const) {
      expect(planDebtPayment({ name: 'An', loan: 700, bill: -200 }, option, 100)).toEqual([]);
    }
  });

  it('hết nợ ở cả hai sổ → không ghi gì', () => {
    for (const option of ['bill', 'loan', 'partial', 'all'] as const) {
      expect(planDebtPayment({ name: 'An', loan: 0, bill: 0.04 }, option, 100)).toEqual([]);
    }
  });
});

describe('planDebtPayment – thanh toán riêng từng sổ', () => {
  it('nợ bill: trả hết số dư bill, không đụng nợ vay', () => {
    expect(brief(planDebtPayment(owe(500, 300), 'bill'))).toEqual([['billpay', 'Tôi', 'An', 300, '']]);
  });

  it('nợ vay: trả hết số dư vay, không đụng nợ bill', () => {
    expect(brief(planDebtPayment(owe(500, 300), 'loan'))).toEqual([['vay', 'Tôi', 'An', 500, '']]);
  });

  it('họ nợ tôi: họ là người trả, tôi là người nhận', () => {
    expect(brief(planDebtPayment(get(500, 300), 'bill'))).toEqual([['billpay', 'An', 'Tôi', 300, '']]);
  });

  it('sổ đã về 0 thì không có gì để trả ở sổ đó', () => {
    expect(planDebtPayment(owe(0, 300), 'loan')).toEqual([]);
    expect(planDebtPayment(owe(500, 0), 'bill')).toEqual([]);
  });
});

describe('planDebtPayment – toàn bộ', () => {
  it('trả hết cả hai sổ: bill trước rồi vay, mỗi sổ một khoản đúng số dư', () => {
    expect(brief(planDebtPayment(owe(500, 300), 'all'))).toEqual([
      ['billpay', 'Tôi', 'An', 300, ''],
      ['vay', 'Tôi', 'An', 500, ''],
    ]);
  });

  it('chỉ một sổ còn nợ → một khoản', () => {
    expect(brief(planDebtPayment(owe(0, 300), 'all'))).toEqual([['billpay', 'Tôi', 'An', 300, '']]);
    expect(brief(planDebtPayment(get(500, 0), 'all'))).toEqual([['vay', 'An', 'Tôi', 500, '']]);
  });
});

describe('planDebtPayment – một phần (bill trước, rồi vay, dư thành nợ vay mới)', () => {
  const debt = owe(500, 300);

  it('nhỏ hơn nợ bill → chỉ trả bill', () => {
    expect(brief(planDebtPayment(debt, 'partial', 100))).toEqual([['billpay', 'Tôi', 'An', 100, '']]);
  });

  it('vừa đủ nợ bill → chỉ trả bill, không đụng nợ vay', () => {
    expect(brief(planDebtPayment(debt, 'partial', 300))).toEqual([['billpay', 'Tôi', 'An', 300, '']]);
  });

  it('vượt nợ bill nhưng chưa hết nợ vay → bill đủ, phần còn lại sang nợ vay', () => {
    expect(brief(planDebtPayment(debt, 'partial', 450))).toEqual([
      ['billpay', 'Tôi', 'An', 300, ''],
      ['vay', 'Tôi', 'An', 150, ''],
    ]);
  });

  it('vừa đủ cả hai → không có phần dư', () => {
    expect(brief(planDebtPayment(debt, 'partial', 800))).toEqual([
      ['billpay', 'Tôi', 'An', 300, ''],
      ['vay', 'Tôi', 'An', 500, ''],
    ]);
  });

  it('vượt tổng nợ → phần dư ghi thành nợ vay mới (bản ghi riêng, ghi chú "Trả dư")', () => {
    expect(brief(planDebtPayment(debt, 'partial', 1000))).toEqual([
      ['billpay', 'Tôi', 'An', 300, ''],
      ['vay', 'Tôi', 'An', 500, ''],
      ['vay', 'Tôi', 'An', 200, PAY_SURPLUS_NOTE],
    ]);
    expect(PAY_SURPLUS_NOTE).toBe('Trả dư');
  });

  it('chỉ còn nợ vay → trả vay, dư thành nợ vay mới', () => {
    expect(brief(planDebtPayment(owe(500, 0), 'partial', 600))).toEqual([
      ['vay', 'Tôi', 'An', 500, ''],
      ['vay', 'Tôi', 'An', 100, PAY_SURPLUS_NOTE],
    ]);
  });

  it('chỉ còn nợ bill, trả vượt → bill đủ rồi dư sang nợ vay mới', () => {
    expect(brief(planDebtPayment(owe(0, 300), 'partial', 350))).toEqual([
      ['billpay', 'Tôi', 'An', 300, ''],
      ['vay', 'Tôi', 'An', 50, PAY_SURPLUS_NOTE],
    ]);
  });

  it('họ nợ tôi: chiều đảo lại, phần dư vẫn cùng chiều khoản trả', () => {
    expect(brief(planDebtPayment(get(500, 300), 'partial', 1000))).toEqual([
      ['billpay', 'An', 'Tôi', 300, ''],
      ['vay', 'An', 'Tôi', 500, ''],
      ['vay', 'An', 'Tôi', 200, PAY_SURPLUS_NOTE],
    ]);
  });

  it('số tiền làm tròn từng đồng; số ≤ 0 hoặc không hợp lệ → không ghi gì', () => {
    expect(brief(planDebtPayment(debt, 'partial', 4.0004))).toEqual([['billpay', 'Tôi', 'An', 4, '']]);
    expect(planDebtPayment(debt, 'partial', 0)).toEqual([]);
    expect(planDebtPayment(debt, 'partial', -5)).toEqual([]);
    expect(planDebtPayment(debt, 'partial', Number.NaN)).toEqual([]);
    expect(planDebtPayment(debt, 'partial')).toEqual([]);
  });

  it('tổng các khoản ghi luôn bằng số tiền người dùng nhập (không bỏ sót phần dư)', () => {
    for (const amount of [0.5, 100, 300, 450, 800, 1000, 1234.567]) {
      const total = planDebtPayment(debt, 'partial', amount).reduce((sum, d) => sum + d.amt, 0);
      expect(Math.round(total * 1e3) / 1e3).toBe(Math.round(amount * 1e3) / 1e3);
    }
  });

  it('không sửa đầu vào', () => {
    const input = owe(500, 300);
    const copy = { ...input };
    planDebtPayment(input, 'partial', 1000);
    expect(input).toEqual(copy);
  });
});

describe('planDebtPayment – ghi thật rồi tính lại số dư', () => {
  const base: Pay[] = [
    { id: 'a', createdAt: 1, date: '2025-10-01', note: '', from: 'An', to: 'Tôi', amt: 500, kind: 'vay' }, // tôi nợ An vay 500
    { id: 'b', createdAt: 2, date: '2025-10-01', note: '', from: 'An', to: 'Tôi', amt: 300, kind: 'billpay' }, // tôi nợ An bill 300
  ];
  const apply = (option: 'bill' | 'loan' | 'partial' | 'all', amount?: number) => {
    const debt = personLedger(debtEvents([], base), 'An');
    const drafts = planDebtPayment(debt, option, amount);
    let n = 0;
    const created = finalizeNewPays(drafts, { now: 100, today: '2025-10-06', newId: () => `n${n++}` });
    return { created, after: personLedger(debtEvents([], [...base, ...created]), 'An') };
  };

  it('ví dụ yêu cầu: trả 1.000 → bill 0, vay +200 (An nợ tôi 200), phần dư là bản ghi riêng', () => {
    const { created, after } = apply('partial', 1000);
    expect(after).toMatchObject({ bill: 0, loan: 200 });
    expect(created.map((c) => [c.kind, c.amt, c.note])).toEqual([
      ['billpay', 300, ''],
      ['vay', 500, ''],
      ['vay', 200, 'Trả dư'],
    ]);
  });

  it('trả toàn bộ → hai sổ về 0', () => {
    expect(apply('all').after).toMatchObject({ bill: 0, loan: 0 });
  });

  it('trả riêng nợ bill → chỉ bill về 0, vay giữ nguyên; trả riêng nợ vay → ngược lại', () => {
    expect(apply('bill').after).toMatchObject({ bill: 0, loan: -500 });
    expect(apply('loan').after).toMatchObject({ bill: -300, loan: 0 });
  });

  it('trả một phần nhỏ hơn nợ bill', () => {
    expect(apply('partial', 100).after).toMatchObject({ bill: -200, loan: -500 });
  });
});

describe('debtPaymentMessage', () => {
  it('liệt kê từng khoản đã ghi', () => {
    const drafts = planDebtPayment(owe(500, 300), 'partial', 1000);
    expect(debtPaymentMessage(drafts)).toBe('Đã ghi Tôi → An 300.000 ₫ · Tôi → An 500.000 ₫ · Tôi → An 200.000 ₫');
    expect(debtPaymentMessage([])).toBe('');
  });
});
