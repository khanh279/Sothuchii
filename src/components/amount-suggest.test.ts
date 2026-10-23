import { amountSuggestions } from './amount-suggest';

describe('amountSuggestions (gợi ý số tiền khi gõ)', () => {
  it('gõ 5 → 5.000, 50.000, 500.000 (gấp 1.000, 10.000, 100.000 lần)', () => {
    expect(amountSuggestions(5)).toEqual([5_000, 50_000, 500_000]);
    expect(amountSuggestions(25)).toEqual([25_000, 250_000, 2_500_000]);
    expect(amountSuggestions(120)).toEqual([120_000, 1_200_000, 12_000_000]);
  });

  it('chưa gõ, số không hợp lệ hoặc đã gõ đủ dài thì không gợi ý', () => {
    expect(amountSuggestions(0)).toEqual([]);
    expect(amountSuggestions(-3)).toEqual([]);
    expect(amountSuggestions(Number.NaN)).toEqual([]);
    expect(amountSuggestions(10_000)).toEqual([]);
    expect(amountSuggestions(9_999)).toHaveLength(3);
  });
});
