import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { InputAccessoryView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';
import { formatGrouped } from '@/utils/format';

/** Nhân gợi ý: số đang gõ × 1.000, × 10.000, × 100.000 (gõ "5" → 5.000 · 50.000 · 500.000). */
const FACTORS = [1_000, 10_000, 100_000] as const;
/** Chỉ gợi ý khi số đang gõ còn ngắn (dưới 10.000), tránh gợi ý những số khổng lồ khi đã gõ đủ. */
const MAX_TYPED = 10_000;

/** Các số gợi ý (đồng) cho số đang gõ `typed`; rỗng khi chưa gõ hoặc đã gõ đủ dài. */
export function amountSuggestions(typed: number): number[] {
  if (!Number.isFinite(typed) || typed <= 0 || typed >= MAX_TYPED) return [];
  return FACTORS.map((factor) => typed * factor);
}

interface Active {
  values: number[];
  onPick: (value: number) => void;
}

export interface AmountSuggestApi {
  show: (active: Active | null) => void;
}

export const AmountSuggestContext = createContext<AmountSuggestApi | null>(null);

/**
 * Thanh gợi ý: tối đa ba số, chạm để chọn. Chiều cao CỐ ĐỊNH kể cả khi chưa có gợi ý (lúc đó chỉ là khoảng trống trong suốt, không có thẻ nền): nhờ vậy
 * chiều cao bàn phím + thanh không đổi khi gợi ý hiện / mất lúc đang gõ, nên khung chứa nút Lưu không bị đẩy đi đẩy lại.
 */
export function AmountSuggestBar({ values, onPick, background }: Active & { background?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.bar, background ? { backgroundColor: background } : null]} accessibilityRole="toolbar">
      {values.map((value) => (
        <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Chọn ${formatGrouped(value)} đồng`} onPress={() => onPick(value)} style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.line }]}>
          <AppText weight="semibold" color={colors.primary} style={styles.chipText} numberOfLines={1}>
            {formatGrouped(value)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Gợi ý số tiền cho MỘT ô nhập số (đồng): gõ "5" thì có 5.000 · 50.000 · 500.000 ngay trên bàn phím, đúng MỘT thanh duy nhất.
 * iOS: thanh phụ của bàn phím (`InputAccessoryView`, mỗi ô một mã riêng). Android / web: thanh của `KeyboardAvoid` gần nhất (nằm trên bàn phím);
 * KHÔNG dùng cả hai cùng lúc nên không bị hai hàng trùng nhau. Dùng qua `MoneyTextInput` / `AmountInput`.
 */
export function useAmountSuggest(value: number, onChangeValue: (value: number) => void) {
  const host = useContext(AmountSuggestContext);
  const colors = useColors();
  const accessoryId = useId();
  const ios = Platform.OS === 'ios';

  /** Gợi ý gần nhất còn hiển thị: gõ số quá dài (không còn gợi ý mới) thì giữ nguyên gợi ý trước đó thay vì mất đi; xoá hết số thì mới xoá. */
  const [last, setLast] = useState<number[]>([]);
  function shown(typed: number): number[] {
    const fresh = amountSuggestions(typed);
    if (fresh.length) {
      setLast(fresh);
      return fresh;
    }
    if (typed <= 0) {
      setLast([]);
      return [];
    }
    return last;
  }

  function publish(typed: number) {
    if (ios || !host) return;
    // Luôn hiện thanh (kể cả chưa có gợi ý) khi ô đang được gõ để chiều cao không đổi; chỉ `onBlur` mới ẩn.
    host.show({ values: shown(typed), onPick: pick });
  }
  function pick(picked: number) {
    onChangeValue(picked);
    publish(picked);
  }

  return {
    /** Gọi khi người dùng gõ ra số đồng mới. */
    onTyped: (typed: number) => {
      onChangeValue(typed);
      if (ios) shown(typed);
      else publish(typed);
    },
    inputProps: {
      onFocus: () => publish(value),
      onBlur: () => host?.show(null),
      inputAccessoryViewID: ios ? accessoryId : undefined,
    },
    /** Thanh phụ của iOS; nơi khác là null. Đặt cạnh ô nhập. */
    accessory: ios ? (
      <InputAccessoryView nativeID={accessoryId} backgroundColor={colors.bg}>
        <AmountSuggestBar values={last} onPick={pick} background={colors.bg} />
      </InputAccessoryView>
    ) : (null as ReactNode),
  };
}

export const AMOUNT_SUGGEST_BAR_HEIGHT = 56;

const styles = StyleSheet.create({
  bar: { height: AMOUNT_SUGGEST_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  chip: { flex: 1, minWidth: 0, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15 },
});
