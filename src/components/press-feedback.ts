/**
 * Phản hồi khi nhấn các nút chức năng lớn: nút thu nhỏ nhẹ và mờ đi trong lúc đang nhấn để người dùng thấy ngay lần chạm đã được nhận.
 * Dùng trong `style={({ pressed }) => [..., pressStyle(pressed, disabled)]}` của `Pressable`; `strength` lớn hơn cho nút nhỏ tròn (ví dụ nút "+").
 */
export function pressStyle(pressed: boolean, disabled = false, strength = 0.97) {
  return { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !disabled ? strength : 1 }] };
}
