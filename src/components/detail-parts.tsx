import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';
import { formatNote } from '@/utils/note';

/**
 * Thành phần giao diện của các trang "Chi tiết" (cùng kiểu với Chi tiết chi tiêu): thẻ nền navy "Số tiền", bảng các dòng nhãn – giá trị ngăn bằng
 * đường mảnh, và dòng ghi chú cuối trang. Chỉ là phần hiển thị.
 */

/** Thẻ nền navy: nhãn nhỏ ("Số tiền") và số tiền lớn. */
export function DetailHero({ label = 'Số tiền', amount }: { label?: string; amount: string }) {
  const colors = useColors();
  return (
    <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
      <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
        {label}
      </AppText>
      <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
        {amount}
      </AppText>
    </View>
  );
}

/** Một dòng nhãn bên trái, giá trị đậm căn phải; `last` bỏ đường kẻ dưới. */
export function DetailField({ label, value, icon, last }: { label: string; value: string; icon?: ReactNode; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.field, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
      <AppText color={colors.muted} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.fieldValueWrap}>
        {icon}
        <AppText weight="semibold" style={styles.fieldValue}>
          {formatNote(value)}
        </AppText>
      </View>
    </View>
  );
}

/** Dòng ghi chú: `error` nền đỏ nhạt, `info` nền navy nhạt. */
export function DetailNotice({ text, tone }: { text: string; tone: 'error' | 'info' }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'error' ? colors.dangerSoft : colors.primarySoft }]}>
      <AppText color={tone === 'error' ? colors.danger : colors.muted} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, gap: 4 },
  heroLabel: { fontSize: 13.5 },
  heroAmount: { fontSize: 36, lineHeight: 44, letterSpacing: -0.6 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  fieldLabel: { fontSize: 13.5 },
  fieldValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  fieldValue: { fontSize: 15, textAlign: 'right', flexShrink: 1 },
  notice: { borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 13.5, lineHeight: 19 },
});
