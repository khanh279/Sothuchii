/**
 * Chống điều hướng lặp khi người dùng bấm hai lần liên tiếp (màn hình mở chậm nên bấm lại): cùng một lệnh điều hướng (cùng loại và cùng đích) trong khoảng `windowMs`
 * kể từ lần được chấp nhận trước thì bị bỏ qua. Lệnh khác loại / khác đích vẫn đi qua ngay, nên chuỗi như "đóng form rồi mở trang khác" không bị chặn.
 */
export function createNavGuard(windowMs: number, now: () => number = Date.now) {
  const accepted = new Map<string, number>();
  return (key: string): boolean => {
    const time = now();
    const last = accepted.get(key);
    if (last !== undefined && time - last < windowMs) return false;
    accepted.set(key, time);
    return true;
  };
}
