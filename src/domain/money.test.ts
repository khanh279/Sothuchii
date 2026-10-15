import { nghinToVnd, roundNghin, roundVnd, vndToNghin } from './money';

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
