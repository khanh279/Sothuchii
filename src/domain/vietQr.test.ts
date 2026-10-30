import { bankByBin, VN_BANKS } from './vnBanks';
import { buildVietQrPayload, cleanAccount, crc16, isValidAccount, transferContent } from './vietQr';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải tài khoản thật.
describe('crc16', () => {
  it('đúng giá trị chuẩn CRC-16/CCITT-FALSE của "123456789" (0x29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('transferContent', () => {
  it('bỏ dấu tiếng Việt, ký tự lạ, gọn khoảng trắng và cắt còn tối đa 25 ký tự', () => {
    expect(transferContent('Trả nợ Đặng Văn Ân')).toBe('Tra no Dang Van An');
    expect(transferContent('  a---b   c  ')).toBe('a b c');
    expect(transferContent('x'.repeat(40))).toHaveLength(25);
  });
});

describe('buildVietQrPayload', () => {
  const base = { bin: '970436', account: '0123456789' };

  it('có số tiền và lời nhắn: mã động (01 = 12), đủ trường theo chuẩn và CRC khớp phần thân', () => {
    const payload = buildVietQrPayload({ ...base, amount: 50_000, content: 'An tra no' });
    const body = payload.slice(0, -4);
    expect(body.startsWith('000201010212')).toBe(true);
    // 38: NAPAS, 00 = A000000727, 01 = (00 BIN + 01 số tài khoản), 02 = QRIBFTTA
    expect(payload).toContain('0010A000000727');
    expect(payload).toContain('0006970436' + '0110' + '0123456789');
    expect(payload).toContain('QRIBFTTA');
    expect(payload).toContain('5303704');
    expect(payload).toContain('540550000');
    expect(payload).toContain('5802VN');
    expect(payload).toContain('62130809An tra no');
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc16(body));
  });

  it('không có số tiền: mã tĩnh (01 = 11), không có trường 54; làm tròn số tiền lẻ', () => {
    const noAmount = buildVietQrPayload(base);
    expect(noAmount.startsWith('000201010211')).toBe(true);
    expect(noAmount).not.toContain('5405');
    expect(buildVietQrPayload({ ...base, amount: 1234.6 })).toContain('54041235');
  });

  it('số tài khoản có khoảng trắng / gạch được làm sạch; sai thì báo lỗi', () => {
    expect(cleanAccount('0123 456-789')).toBe('0123456789');
    expect(buildVietQrPayload({ bin: '970436', account: '0123 456 789' })).toBe(buildVietQrPayload(base));
    expect(isValidAccount('12345')).toBe(false);
    expect(() => buildVietQrPayload({ bin: '970436', account: '12' })).toThrow('Số tài khoản không hợp lệ.');
    expect(() => buildVietQrPayload({ bin: '9704', account: '0123456789' })).toThrow('Mã ngân hàng không hợp lệ.');
  });
});

describe('VN_BANKS', () => {
  it('mã ngân hàng gồm 6 chữ số, không trùng, tra theo mã được', () => {
    const bins = VN_BANKS.map((bank) => bank.bin);
    expect(new Set(bins).size).toBe(bins.length);
    expect(bins.every((bin) => /^\d{6}$/.test(bin))).toBe(true);
    expect(bankByBin('970436')?.code).toBe('Vietcombank');
    expect(bankByBin('000000')).toBeUndefined();
  });
});
