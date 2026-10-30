import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CheckSlot } from '@/components/check-slot';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { isPickableBill } from '@/domain/pickedPayment';
import type { BillPair, BillPairItem } from '@/domain/billPairs';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { formatNote } from '@/utils/note';
import { router } from '@/utils/safe-router';

/** Chiều tiền theo góc nhìn của "Tôi": '−' tôi trả đi, '+' tôi nhận về, '' cặp không có tôi (không dấu, màu thường). */
export type Sign = '+' | '−' | '';

/** Dấu của khoản cùng chiều với cặp (`from` → `to`); khoản bù trừ (chiều ngược lại) có dấu ngược. */
export function signOf(pair: Pick<BillPair, 'from' | 'to'>, offset: boolean): Sign {
  const forward: Sign = pair.from === BILL_OWNER_NAME ? '−' : pair.to === BILL_OWNER_NAME ? '+' : '';
  if (!forward || !offset) return forward;
  return forward === '−' ? '+' : '−';
}

/** Chế độ chọn khoản bill để thanh toán: các bill đã tích và hàm tích / bỏ tích một bill. */
export interface BillSelection {
  selected: ReadonlySet<string>;
  onToggle: (billId: string) => void;
}

/** Xếp các khoản bill từ cũ đến mới (cùng ngày giữ nguyên thứ tự): đúng thứ tự tiền trả được trừ vào (bill cũ trước). */
function byDate(list: readonly BillPairItem[]): BillPairItem[] {
  return [...list].sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? -1 : 1));
}

/**
 * DANH SÁCH các khoản nợ bill của một cặp (dùng chung cho trang Thanh toán bill và ngăn Nợ bill của trang chi tiết nợ với một người, để hai nơi luôn giống hệt nhau):
 * MỘT list phẳng, không tiêu đề nhóm, không ẩn; mỗi dòng là tên bill, ngày (kèm "Đã trả …" / "Bù trừ") và số còn lại có dấu / màu. Chạm một dòng mở chi tiết bill.
 * `selection`: chế độ chọn khoản để thanh toán — mỗi khoản cùng chiều có ô tích (trượt ra), chạm dòng để tích / bỏ tích thay vì mở chi tiết; khoản bù trừ không chọn được.
 */
export function BillItemsList({ pair, items, selection }: { pair: BillPair; items: readonly BillPairItem[]; selection?: BillSelection }) {
  return (
    <View>
      {byDate(items).map((item, index) => (
        <ItemRow key={`${item.billId}>${index}`} item={item} sign={signOf(pair, item.offset)} first={index === 0} selection={selection} />
      ))}
    </View>
  );
}

function ItemRow({ item, sign, first, selection }: { item: BillPairItem; sign: Sign; first: boolean; selection?: BillSelection }) {
  const colors = useColors();
  const color = sign === '+' ? colors.success : sign === '−' ? colors.danger : undefined;
  const selecting = !!selection;
  const pickable = isPickableBill(item);
  const toggle = () => selection?.onToggle(item.billId);
  const paidNote = item.offset ? 'Bù trừ' : item.state === 'partial' ? `Đã trả ${formatVnd(item.paid)}` : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title || 'Không tên'}, ${sign}${formatVnd(item.remaining)}`}
      onPress={() => (selecting ? (pickable ? toggle() : undefined) : router.push({ pathname: '/chia-bill/chi-tiet', params: { id: item.billId } }))}
      style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <CheckSlot active={selecting} disabled={!pickable} checked={!!selection?.selected.has(item.billId)} label={item.title || 'Không tên'} onToggle={toggle} />
      <View style={styles.flex}>
        <AppText weight="medium" style={styles.itemTitle} numberOfLines={2}>
          {item.title || 'Không tên'}
        </AppText>
        <AppText color={colors.muted} style={styles.itemSub}>
          {formatNote(formatVnDate(item.date))}
        </AppText>
      </View>
      <View style={styles.itemRight}>
        <AppText weight="semibold" color={color} style={styles.itemAmount}>
          {sign}
          {formatVnd(item.remaining)}
        </AppText>
        {!!paidNote && (
          <AppText color={colors.muted} style={styles.itemSub}>
            {paidNote}
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
  itemRight: { alignItems: 'flex-end', flexShrink: 0 },
});
