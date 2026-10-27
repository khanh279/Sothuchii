import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

/** Hai dòng căn phải: `+số` màu xanh (người khác nợ tôi) trên, `−số` màu đỏ (tôi nợ) dưới; không có thì vẫn hiện +0 / −0. Cỡ chữ như hai dòng tổng + / − ở trang "Giao dịch" (11, không đậm). */
export function SignedTotals({ get, owe }: { get: number; owe: number }) {
  const colors = useColors();
  return (
    <View style={styles.totals}>
      <AppText color={colors.success} style={styles.totalLine}>
        +{formatVnd(get)}
      </AppText>
      <AppText color={colors.danger} style={styles.totalLine}>
        −{formatVnd(owe)}
      </AppText>
    </View>
  );
}

/** Một khối con KHÔNG khung viền: tiêu đề đậm và ghi chú nhỏ mờ ngay bên dưới (thời gian), rồi nội dung. */
export function DebtBlock({ title, note, right, children }: { title: string; note: string; right?: ReactNode; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <View style={styles.blockLeft}>
          <AppText weight="bold" style={styles.blockTitle}>
            {title}
          </AppText>
          <AppText color={colors.muted} style={styles.blockNote} numberOfLines={1}>
            {note}
          </AppText>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  blockLeft: { flex: 1, minWidth: 0 },
  totals: { alignItems: 'flex-end', flexShrink: 0 },
  totalLine: { fontSize: 11, lineHeight: 15, textAlign: 'right' },
  blockTitle: { fontSize: 15.5, lineHeight: 21 },
  blockNote: { fontSize: 12.5, lineHeight: 17 },
});
