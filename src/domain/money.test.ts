import { formatVndInput, maskVndInput, parseVndInput, roundVnd } from './money';

describe('money', () => {
  it('roundVnd làm tròn về đồng nguyên và coi giá trị không hợp lệ là 0', () => {
    expect(roundVnd(33333.4)).toBe(33333);
    expect(roundVnd(33333.5)).toBe(33334);
    expect(roundVnd(NaN)).toBe(0);
    expect(roundVnd(undefined as unknown as number)).toBe(0);
  });

  it('chia bill 100.000 đ cho 3 người chỉ lệch vài đồng', () => {
    const moiNguoi = roundVnd(100_000 / 3);
    expect(moiNguoi).toBe(33333);
    expect(Math.abs(moiNguoi * 3 - 100_000)).toBeLessThanOrEqual(3);
  });
});

describe('ô nhập tiền theo ĐỒNG', () => {
  it('maskVndInput: chỉ giữ chữ số, bỏ số 0 đầu', () => {
    expect(maskVndInput('')).toBe('');
    expect(maskVndInput('1234')).toBe('1234');
    expect(maskVndInput('0012')).toBe('12');
    expect(maskVndInput('0')).toBe('0');
    expect(maskVndInput('1.234.567')).toBe('1234567'); // gõ lại chuỗi đã có dấu chấm
  });

  it('maskVndInput: bỏ ký tự lạ (dấu phẩy, dấu trừ, chữ) và cắt ở số chữ số tối đa', () => {
    expect(maskVndInput('abc')).toBe('');
    expect(maskVndInput('12a3')).toBe('123');
    expect(maskVndInput('7,5')).toBe('75');
    expect(maskVndInput('-5')).toBe('5');
    expect(maskVndInput('1234567890')).toBe('123456789'); // mặc định 9 chữ số
    expect(maskVndInput('123456789', 7)).toBe('1234567');
  });

  it('parseVndInput: chữ -> ĐỒNG, không nhân thêm', () => {
    expect(parseVndInput('7000')).toBe(7000);
    expect(parseVndInput('1.234.567')).toBe(1_234_567);
    expect(parseVndInput('50000')).toBe(50_000);
  });

  it('parseVndInput: rỗng hoặc không hợp lệ là 0', () => {
    expect(parseVndInput('')).toBe(0);
    expect(parseVndInput('abc')).toBe(0);
  });

  it('formatVndInput: ĐỒNG -> chữ số trong state của form', () => {
    expect(formatVndInput(7500)).toBe('7500');
    expect(formatVndInput(1_234_567)).toBe('1234567');
    expect(formatVndInput(0)).toBe('');
    expect(formatVndInput(NaN)).toBe('');
    expect(formatVndInput(-5)).toBe('');
  });

  it('đi và về nguyên vẹn: parse(format(x)) === x với mọi số đồng nguyên dương', () => {
    for (const vnd of [1, 7, 500, 999, 1000, 1001, 7500, 12_345, 1_234_567, 98_765_432_101]) {
      expect({ vnd, back: parseVndInput(formatVndInput(vnd)) }).toEqual({ vnd, back: vnd });
    }
  });
});
