import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CheckSlot } from '@/components/check-slot';
import { toneOf } from '@/domain/debtDetail';
import { isOwedLoan, isPickableLoan, paidLoanViews, type LoanLineView } from '@/domain/loanAllocation';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

/**
 * DANH SÁCH các khoản vay với một người (dùng chung cho trang Chi tiết nợ vay và ngăn Nợ vay của trang chi tiết nợ với một người, để hai nơi luôn giống hệt nhau):
 * mỗi dòng là nội dung khoản chuyển tiền, ngày ở dưới, bên phải số tiền có dấu / màu (− đỏ: tôi phải trả, + xanh: người kia phải trả tôi).
 * `selection`: chế độ chọn khoản để thanh toán — mỗi dòng có ô tích (trượt ra), chạm dòng để tích / bỏ tích.
 */
/**
 * `mode` 'owed' (mặc định): chỉ các khoản vay CÒN NỢ; 'paid': chỉ các khoản đã trả xong chưa bị ẩn (`hidden`). Chỉ số `selection` luôn là vị trí trong `views` đầy đủ nên không đổi khi lọc.
 */
export function LoanLinesList({
  views,
  selection,
  mode = 'owed',
  hidden,
}: {
  views: readonly LoanLineView[];
  selection?: { selected: ReadonlySet<number>; onToggle: (index: number) => void };
  mode?: 'owed' | 'paid';
  hidden?: ReadonlySet<string>;
}) {
  const shown = views
    .map((view, index) => ({ view, index }))
    .filter(({ view }) => (mode === 'owed' ? isOwedLoan(view) : paidLoanViews([view], hidden ?? new Set()).length > 0));
  return (
    <View>
      {shown.map(({ view, index }, position) => (
        <LoanRow key={index} view={view} first={position === 0} checked={!!selection?.selected.has(index)} selecting={!!selection} onToggle={selection && isPickableLoan(view) ? () => selection.onToggle(index) : undefined} />
      ))}
    </View>
  );
}

function LoanRow({ view, first, checked, selecting, onToggle }: { view: LoanLineView; first: boolean; checked: boolean; selecting: boolean; onToggle?: () => void }) {
  const colors = useColors();
  const line = view.line;
  const tone = toneOf(line.v);
  const done = view.kind === 'debt' && view.state === 'paid';
  const color = done ? colors.muted : tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : undefined;
  // Khoản vay đã trả xong: mờ và gạch ngang; trả một phần: ghi số đã trả; khoản trả (ngược chiều) ghi "Khoản đã trả".
  const note = view.kind === 'repay' ? 'Khoản đã trả' : view.state === 'partial' ? `Đã trả ${formatVnd(view.paid)}` : done ? 'Đã thanh toán' : '';
  return (
    <Pressable
      disabled={!onToggle}
      accessibilityRole={onToggle ? 'button' : undefined}
      onPress={onToggle}
      style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <CheckSlot active={selecting} disabled={!onToggle} checked={checked} label={line.title} onToggle={onToggle ?? (() => undefined)} />
      <View style={styles.flex}>
        <AppText weight="medium" color={done ? colors.muted : undefined} style={[styles.itemTitle, done && styles.done]} numberOfLines={2}>
          {line.title}
        </AppText>
        <AppText color={colors.muted} style={styles.itemSub}>
          {formatVnDate(line.date)}
        </AppText>
      </View>
      <View style={styles.right}>
        <AppText weight="semibold" color={color} style={[styles.itemAmount, done && styles.done]}>
          {SIGN[tone]}
          {formatVnd(Math.abs(line.v))}
        </AppText>
        {!!note && (
          <AppText color={colors.muted} style={styles.itemSub}>
            {note}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  itemTitle: { fontSize: 15.5, lineHeight: 21 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 14.5, lineHeight: 20 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  done: { textDecorationLine: 'line-through' },
});
