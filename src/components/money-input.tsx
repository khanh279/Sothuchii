import { useEffect, useRef } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

import { useAmountSuggest } from '@/components/amount-suggest';
import { parseAmountInput } from '@/domain/expenses';
import { formatGrouped } from '@/utils/format';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** Số tiền (ĐỒNG, số nguyên); 0 = để trống. */
  value: number;
  onChangeValue: (value: number) => void;
}

/** Chữ số cùng độ rộng: thêm / bớt chữ số không làm các chữ số khác co giãn. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };
/** Mọi ô tiền căn phải (số thẳng hàng theo hàng đơn vị). Đặt SAU style của nơi dùng nên luôn có hiệu lực. */
const RIGHT = { textAlign: 'right' as const };

/**
 * Ô nhập số tiền DUY NHẤT của ứng dụng (đơn vị ĐỒNG, tự thêm dấu chấm hàng nghìn khi gõ, bàn phím số) kèm gợi ý số gấp 1.000 / 10.000 / 100.000 lần
 * ngay trên bàn phím. Mọi ô tiền (trừ ô lớn `AmountInput` cũng dùng chung cơ chế này) đều dùng ô này, nên không còn ô nhập theo "nghìn đồng" / hậu tố ".000".
 * Kiểu dáng do nơi dùng truyền vào `style` như một `TextInput` thường.
 *
 * Chống "chữ co lại rồi dãn ra": nếu chờ JS ghi đè `value` đã có dấu chấm thì ô vẽ chữ vừa gõ (chưa có dấu chấm) rồi mới vẽ bản định dạng, hai lần vẽ khác độ rộng.
 * Nên ngay trong `onChangeText` ta đặt chữ đã định dạng thẳng xuống ô native (`setNativeProps`) trong cùng khung hình; khi React ghi `value` thì đã trùng nên không vẽ lại.
 * Chữ số dùng `tabular-nums`. Ô web không cần (không có vòng chờ này).
 */
export function MoneyTextInput({ value, onChangeValue, onFocus, onBlur, style, ...rest }: Props) {
  const suggest = useAmountSuggest(value, onChangeValue);
  const inputRef = useRef<TextInput>(null);
  const text = value ? formatGrouped(value) : '';
  /** Chữ native đang mang (do ta đặt hoặc do React ghi): chỉ ghi xuống ô khi khác, để mỗi phím gõ chỉ có tối đa MỘT lần viết lại ô. */
  const nativeText = useRef(text);

  // Giá trị đổi từ bên ngoài (chọn gợi ý, đặt lại…): đưa chữ định dạng xuống ô ngay; nếu ô đã đúng chữ đó thì không làm gì.
  useEffect(() => {
    if (Platform.OS === 'web' || nativeText.current === text) return;
    nativeText.current = text;
    inputRef.current?.setNativeProps({ text });
  }, [text]);

  return (
    <>
      <TextInput
        {...rest}
        ref={inputRef}
        style={[TABULAR, style, RIGHT]}
        value={text}
        onChangeText={(typed) => {
          const next = parseAmountInput(typed);
          const formatted = next ? formatGrouped(next) : '';
          nativeText.current = formatted;
          if (Platform.OS !== 'web' && formatted !== typed) inputRef.current?.setNativeProps({ text: formatted });
          suggest.onTyped(next);
        }}
        keyboardType="number-pad"
        onFocus={(event) => {
          suggest.inputProps.onFocus();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          suggest.inputProps.onBlur();
          onBlur?.(event);
        }}
        inputAccessoryViewID={suggest.inputProps.inputAccessoryViewID}
      />
      {suggest.accessory}
    </>
  );
}
