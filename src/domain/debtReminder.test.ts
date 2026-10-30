import { buildDebtReminder } from './debtReminder';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật.
describe('buildDebtReminder', () => {
  it('liệt kê nợ vay và nợ bill, tổng và tài khoản chuyển khoản', () => {
    const text = buildDebtReminder({
      name: 'An',
      loans: [{ title: 'Vay tiền xe', date: '2025-10-02', amount: 50_000 }],
      bills: [{ title: 'Ăn tối', date: '2025-10-01', amount: 30_000 }],
      total: 80_000,
      bank: { bin: '970422', account: '0123456789', name: 'NGUYEN VAN A' },
    });
    expect(text).toContain('Chào An');
    expect(text).toContain('Nợ vay:\n• Vay tiền xe (02/10/2025): 50.000');
    expect(text).toContain('Nợ bill:\n• Ăn tối (01/10/2025): 30.000');
    expect(text).toContain('Tổng cộng: 80.000');
    expect(text).toContain('Chuyển khoản: MB Bank 0123456789 (NGUYEN VAN A)');
  });

  it('không có nợ vay / tài khoản thì bỏ các phần đó', () => {
    const text = buildDebtReminder({ name: 'Bình', loans: [], bills: [{ title: '', date: '2025-10-01', amount: 10_000 }], total: 10_000 });
    expect(text).not.toContain('Nợ vay');
    expect(text).not.toContain('Chuyển khoản');
    expect(text).toContain('• Khoản (01/10/2025)');
  });
});
