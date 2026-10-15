import { formatNghinInput, maskNghinInput, nghinToVnd, parseNghinInput, roundNghin, roundVnd, vndToNghin } from './money';

describe('money', () => {
  it('đổi nghìn đồng sang đồng', () => {
    expect(nghinToVnd(100)).toBe(100000);
    expect(nghinToVnd(33.333)).toBe(33333);
    expect(nghinToVnd(0.5)).toBe(500);
  });

  it('coi giá trị không hợp lệ là 0', () => {
    expect(nghinToVnd(NaN)).toBe(0);
    expect(nghinToVnd(undefined as unknown as number)).toBe(0);
    expect(roundVnd(NaN)).toBe(0);
  });

  it('đổi đồng sang nghìn đồng', () => {
    expect(vndToNghin(100000)).toBe(100);
    expect(vndToNghin(1500)).toBe(1.5);
  });

  it('chia bill 100.000 đ cho 3 người chỉ lệch vài đồng', () => {
    const phan = 100 / 3; // nghìn đồng
    const moiNguoi = nghinToVnd(phan);
    expect(moiNguoi).toBe(33333);
    expect(Math.abs(moiNguoi * 3 - 100000)).toBeLessThanOrEqual(3);
  });

  it('roundNghin làm tròn đến từng đồng', () => {
    expect(roundNghin(33.33333333)).toBe(33.333);
    expect(roundNghin(1.0004)).toBe(1);
  });
});

describe('ô nhập theo nghìn đồng (Quỹ nhóm)', () => {
  it('maskNghinInput: chấm hàng nghìn, phẩy thập phân, bỏ số 0 đầu', () => {
    expect(maskNghinInput('')).toBe('');
    expect(maskNghinInput('1234')).toBe('1.234');
    expect(maskNghinInput('0012')).toBe('12');
    expect(maskNghinInput('0')).toBe('0');
    expect(maskNghinInput('1234567')).toBe('1.234.567');
    expect(maskNghinInput('1.234')).toBe('1.234'); // gõ lại chuỗi đã có dấu chấm
  });

  it('maskNghinInput: phần thập phân tối đa 3 chữ số, giữ dấu phẩy đang gõ dở', () => {
    expect(maskNghinInput('7,')).toBe('7,');
    expect(maskNghinInput('7,5')).toBe('7,5');
    expect(maskNghinInput('1234,5678')).toBe('1.234,567');
    expect(maskNghinInput(',5')).toBe('0,5');
    expect(maskNghinInput('1,2,3')).toBe('1,23'); // dấu phẩy thứ hai bị bỏ
  });

  it('maskNghinInput: bỏ ký tự lạ và cắt phần nguyên ở 9 chữ số', () => {
    expect(maskNghinInput('abc')).toBe('');
    expect(maskNghinInput('12a3')).toBe('123');
    expect(maskNghinInput('1234567890')).toBe('123.456.789');
    expect(maskNghinInput('-5')).toBe('5');
  });

  it('parseNghinInput: nhập nghìn đồng → lưu ĐỒNG', () => {
    expect(parseNghinInput('7')).toBe(7000);
    expect(parseNghinInput('7,5')).toBe(7500);
    expect(parseNghinInput('1.234,567')).toBe(1_234_567);
    expect(parseNghinInput('0,5')).toBe(500);
    expect(parseNghinInput('0,001')).toBe(1);
    expect(parseNghinInput('100')).toBe(100_000);
  });

  it('parseNghinInput: rỗng hoặc không hợp lệ là 0', () => {
    expect(parseNghinInput('')).toBe(0);
    expect(parseNghinInput('abc')).toBe(0);
    expect(parseNghinInput(',')).toBe(0);
    expect(parseNghinInput('0,0004')).toBe(0);
  });

  it('formatNghinInput: ĐỒNG → chữ trong ô nhập nghìn đồng', () => {
    expect(formatNghinInput(7500)).toBe('7,5');
    expect(formatNghinInput(7000)).toBe('7');
    expect(formatNghinInput(500)).toBe('0,5');
    expect(formatNghinInput(1)).toBe('0,001');
    expect(formatNghinInput(1_234_567)).toBe('1.234,567');
    expect(formatNghinInput(999_999_999_999)).toBe('999.999.999,999');
    expect(formatNghinInput(0)).toBe('');
    expect(formatNghinInput(NaN)).toBe('');
  });

  it('đi và về nguyên vẹn: parse(format(x)) === x với mọi số đồng nguyên', () => {
    for (const vnd of [1, 7, 500, 999, 1000, 1001, 7500, 12_345, 1_234_567, 98_765_432_101]) {
      expect({ vnd, back: parseNghinInput(formatNghinInput(vnd)) }).toEqual({ vnd, back: vnd });
    }
  });

  it('đơn vị: đóng quỹ nhập nghìn nhưng lưu đồng, khác với chi quỹ nhập đồng', () => {
    // "50" ở ô đóng quỹ là 50 nghìn = 50.000 ₫
    expect(parseNghinInput('50')).toBe(50_000);
    // còn ở ô chi quỹ, người dùng gõ 50000 đồng → parseAmountInput (đã có ở expenses) cho đúng 50000, không nhân thêm
    expect(nghinToVnd(50)).toBe(50_000);
  });
});
