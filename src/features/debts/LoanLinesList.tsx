import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CheckSlot } from '@/components/check-slot';
import { toneOf } from '@/domain/debtDetail';
import type { LoanLine } from '@/domain/ledger';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

/**
 * DANH SÁCH các khoản vay với một người (dùng chung cho trang Chi tiết nợ vay và ngăn Nợ vay của trang chi tiết nợ với một người, để hai nơi luôn giống hệt nhau):
 * mỗi dòng là nội dung khoản chuyển tiền, ngày ở dưới, bên phải số tiền có dấu / màu (− đỏ: tôi phải trả, + xanh: người kia phải trả tôi).
 * `selection`: chế độ chọn khoản để thanh toán — mỗi dòng có ô tích (trượt ra), chạm dòng để tích / bỏ tích.
 */
export function LoanLinesList({ lines, selection }: { lines: readonly LoanLine[]; selection?: { selected: ReadonlySet<number>; onToggle: (index: number) => void } }) {
  return (
    <View>
      {lines.map((line, index) => (
        <LoanRow key={index} line={line} first={index === 0} checked={!!selection?.selected.has(index)} onToggle={selection ? () => selection.onToggle(index) : undefined} />
      ))}
    </View>
  );
}

function LoanRow({ line, first, checked, onToggle }: { line: LoanLine; first: boolean; checked: boolean; onToggle?: () => void }) {
  const colors = useColors();
  const tone = toneOf(line.v);
  const color = tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : undefined;
  return (
    <Pressable
      disabled={!onToggle}
      accessibilityRole={onToggle ? 'button' : undefined}
      onPress={onToggle}
      style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <CheckSlot active={!!onToggle} checked={checked} label={line.title} onToggle={onToggle ?? (() => undefined)} />
      <View style={styles.flex}>
        <AppText weight="medium" style={styles.itemTitle} numberOfLines={2}>
          {line.title}
        </AppText>
        <AppText color={colors.muted} style={styles.itemSub}>
          {formatVnDate(line.date)}
        </AppText>
      </View>
      <AppText weight="semibold" color={color} style={styles.itemAmount}>
        {SIGN[tone]}
        {formatVnd(Math.abs(line.v))}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  itemTitle: { fontSize: 15.5, lineHeight: 21 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 14.5, lineHeight: 20 },
});
