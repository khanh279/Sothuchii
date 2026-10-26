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
export function DetailField({
  label,
  value,
  note,
  sub,
  bold,
  icon,
  last,
}: {
  label: string;
  value: string;
  /** Ghi chú nhỏ ngay dưới giá trị (căn phải). */ note?: string;
  /** Ghi chú nhỏ ngay dưới nhãn (căn trái), vd. ngày. */ sub?: string;
  /** Nhãn đậm, màu chính (vd. nội dung khoản chi). */ bold?: boolean;
  icon?: ReactNode;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.field, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
      <View style={styles.fieldLabelCol}>
        <AppText color={bold ? colors.ink : colors.muted} weight={bold ? 'semibold' : undefined} style={styles.fieldLabel}>
          {label}
        </AppText>
        {!!sub && (
          <AppText color={colors.muted} style={styles.fieldNote}>
            {sub}
          </AppText>
        )}
      </View>
      <View style={styles.fieldValueWrap}>
        {icon}
        <View style={styles.fieldValueCol}>
          <AppText weight="semibold" style={styles.fieldValue}>
            {formatNote(value)}
          </AppText>
          {!!note && (
            <AppText color={colors.muted} style={styles.fieldNote}>
              {note}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

/** Dòng ghi chú: `error` là ô nền đỏ nhạt; `info` là chữ nhỏ mờ căn trái nằm dưới khung (không đặt trong ô). */
export function DetailNotice({ text, tone }: { text: string; tone: 'error' | 'info' }) {
  const colors = useColors();
  if (tone === 'info') {
    return (
      <AppText color={colors.muted} style={styles.infoText}>
        {text}
      </AppText>
    );
  }
  return (
    <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
      <AppText color={colors.danger} style={styles.noticeText}>
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
  fieldLabelCol: { flexShrink: 1, maxWidth: '55%' },
  fieldValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  fieldValueCol: { flexShrink: 1, alignItems: 'flex-end' },
  fieldValue: { fontSize: 15, textAlign: 'right', flexShrink: 1 },
  fieldNote: { fontSize: 12, lineHeight: 17, textAlign: 'right' },
  notice: { borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 13.5, lineHeight: 19 },
  infoText: { fontSize: 12.5, lineHeight: 17, paddingHorizontal: 4 },
});
