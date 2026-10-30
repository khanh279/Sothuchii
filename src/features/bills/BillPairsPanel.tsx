import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { EmptyState, SectionCard } from '@/components/design';
import { PaymentPanel } from '@/components/payment-panel';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { recordBillPairPaymentSynced } from '@/data/payService';
import { BILL_OWNER_NAME } from '@/domain/bills';
import type { BillPair } from '@/domain/billPairs';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { periodTitle } from '@/domain/expenses';
import { describeDebtError } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import { formatVnd } from '@/utils/format';

interface OverviewProps {
  bills: readonly Bill[];
  period: Period;
}

/**
 * Phần A — Tổng quan: số bill và tổng tiền các bill trong kỳ nằm ở GÓC PHẢI đầu thẻ (như các thẻ tổng quan ở trang khác), rồi số tiền THỰC TẾ mỗi người đã chi trả (`buildBillOverviewCard`).
 * Mặc định 3 người chi nhiều nhất, "Xem tất cả" để mở rộng. Đây là tiền đã bỏ ra, KHÁC phần mỗi người phải chịu (xem ở chi tiết bill).
 */
/** Các hàng "ai chi bao nhiêu" (tên, số tiền, thanh tỉ lệ); không bọc thẻ. */
export function BillSpenderRows({ rows }: { rows: ReturnType<typeof buildBillOverviewCard>['rows'] }) {
  const colors = useColors();
  if (rows.length === 0) {
    return (
      <AppText color={colors.muted} style={styles.note}>
        Chưa có ai chi tiền trong khoảng này
      </AppText>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <View key={row.name} style={styles.spender} accessible accessibilityLabel={`${row.name} đã chi ${formatVnd(row.amount)}`}>
          <View style={styles.spenderTop}>
            <AppText weight="semibold" style={[styles.flex, styles.name]} numberOfLines={1}>
              {row.name}
            </AppText>
            <AppText weight="bold" style={styles.name}>
              {formatVnd(row.amount)}
            </AppText>
          </View>
          <View style={[styles.track, { backgroundColor: colors.primarySoft }]}>
            <View style={[styles.fill, { backgroundColor: colors.primary, width: `${row.percent}%` }]} />
          </View>
        </View>
      ))}
    </>
  );
}

export function BillOverviewSection({ bills, period }: OverviewProps) {
  const colors = useColors();
  const [showAll, setShowAll] = useState(false);
  const card = useMemo(() => buildBillOverviewCard(bills, period, showAll), [bills, period, showAll]);
  return (
    <SectionCard title="Tổng quan" subtitle={periodTitle(period)} rightTop={`${card.count} bill`} rightBottom={formatVnd(card.total)}>
      <View style={styles.inner}>
        {card.rows.length === 0 ? (
          <AppText color={colors.muted} style={styles.note}>
            Chưa có ai chi tiền trong khoảng này
          </AppText>
        ) : (
          card.rows.map((row) => (
            <View key={row.name} style={styles.spender} accessible accessibilityLabel={`${row.name} đã chi ${formatVnd(row.amount)}`}>
              <View style={styles.spenderTop}>
                <AppText weight="semibold" style={[styles.flex, styles.name]} numberOfLines={1}>
                  {row.name}
                </AppText>
                <AppText weight="bold" style={styles.name}>
                  {formatVnd(row.amount)}
                </AppText>
              </View>
              <View style={[styles.track, { backgroundColor: colors.primarySoft }]}>
                <View style={[styles.fill, { backgroundColor: colors.primary, width: `${row.percent}%` }]} />
              </View>
            </View>
          ))
        )}
        {(card.hidden > 0 || card.canCollapse) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={card.canCollapse ? 'Thu gọn' : `Xem tất cả, còn ${card.hidden} người nữa`}
            accessibilityState={{ expanded: card.canCollapse }}
            hitSlop={8}
            onPress={() => setShowAll((open) => !open)}
            style={styles.more}
          >
            <View style={{ transform: [{ rotate: card.canCollapse ? '-90deg' : '90deg' }] }}>
              <SvgIcon name="chevronRight" size={18} color={colors.muted} strokeWidth={2.2} />
            </View>
          </Pressable>
        )}
      </View>
    </SectionCard>
  );
}

interface PairsProps {
  pairs: readonly BillPair[];
  period: Period;
  /** Chạm một khoản để mở trang thanh toán của cặp đó (không lọc lịch sử). */
  onOpen: (key: string) => void;
}

/**
 * Các cặp cần thanh toán chia ba vùng có tiêu đề: Nợ tôi → Tôi nợ → Người khác (cặp không có "Tôi"); vùng trống thì không hiện. Chạm một cặp để mở trang thanh toán của cặp đó. Không bọc thẻ.
 */
export function BillPairsZones({ pairs, onOpen }: { pairs: readonly BillPair[]; onOpen: (key: string) => void }) {
  const colors = useColors();
  const groups = [
    { title: 'Nợ tôi', pairs: pairs.filter((pair) => pair.to === BILL_OWNER_NAME) },
    { title: 'Tôi nợ', pairs: pairs.filter((pair) => pair.from === BILL_OWNER_NAME) },
    { title: 'Người khác', pairs: pairs.filter((pair) => pair.from !== BILL_OWNER_NAME && pair.to !== BILL_OWNER_NAME) },
  ].filter((group) => group.pairs.length > 0);
  if (pairs.length === 0) return <EmptyState text="Không còn khoản nào cần thanh toán" icon="check" />;
  return (
    <View style={styles.pairs}>
      {groups.map((group) => (
        <View key={group.title} style={styles.zone}>
          <View style={styles.zoneHead}>
            <AppText weight="semibold" color={colors.muted} style={styles.zoneTitle}>
              {group.title}
            </AppText>
            <AppText color={colors.muted} style={styles.note}>
              {group.pairs.length} khoản
            </AppText>
          </View>
          {group.pairs.map((pair) => {
            const iOwe = pair.from === BILL_OWNER_NAME;
            const owedToMe = pair.to === BILL_OWNER_NAME;
            const name = iOwe ? pair.to : pair.from;
            const amountColor = owedToMe ? colors.success : colors.danger;
            return (
              <SelectableCard
                key={pair.key}
                selected={false}
                onPress={() => onOpen(pair.key)}
                accessibilityLabel={`Thanh toán ${pair.from} trả ${pair.to} ${formatVnd(pair.remaining)}`}>
                <View style={styles.pairRow}>
                  {iOwe || owedToMe ? (
                    <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
                      {name}
                    </AppText>
                  ) : (
                    // Cặp người khác: "A ⇨ B" với mũi tên khối nhạt giữa hai tên, hai tên cùng chiều cao dòng nên mũi tên căn giữa.
                    <View style={[styles.flex, styles.otherName]}>
                      <AppText weight="semibold" style={[styles.rowName, styles.otherPart]} numberOfLines={1}>
                        {pair.from}
                      </AppText>
                      <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityLabel="trả cho">
                        <Path d="M2 9h11V4.5L22 12l-9 7.5V15H2z" fill={colors.muted} fillOpacity={0.6} />
                      </Svg>
                      <AppText weight="semibold" style={[styles.rowName, styles.otherPart]} numberOfLines={1}>
                        {pair.to}
                      </AppText>
                    </View>
                  )}
                  {/* Cặp người khác: số tiền màu đen (không đỏ / xanh, không dấu); cặp có "Tôi": đỏ −, xanh +. */}
                  <AppText weight="bold" color={iOwe || owedToMe ? amountColor : colors.ink} style={styles.pairAmount}>
                    {iOwe || owedToMe ? (owedToMe ? '+' : '−') : ''}
                    {formatVnd(pair.remaining)}
                  </AppText>
                  <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
                </View>
              </SelectableCard>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Phần B — Thanh toán bill: mỗi cặp một thẻ gọn dài hết bề rộng, cùng MỘT hàng: bên trái nhãn "Tôi nợ" (nền đỏ) hoặc "Nợ tôi" (nền xanh) rồi tên người kia, bên phải là số còn
 * phải trả (đã trừ các khoản đã ghi nhận) có dấu −/+. Cặp không có "Tôi" thì ghi "A → B" không nhãn. Chạm thẻ để mở trang thanh toán của cặp đó.
 */
export function BillPairsSection({ pairs, period, onOpen }: PairsProps) {
  return (
    <SectionCard title="Thanh toán bill" subtitle={periodTitle(period)} rightTop={`${pairs.length} khoản`} rightBottom={formatVnd(pairs.reduce((sum, pair) => sum + pair.remaining, 0))}>
      <BillPairsZones pairs={pairs} onOpen={onOpen} />
    </SectionCard>
  );
}

interface PanelProps {
  pair: BillPair;
  period: Period;
  /** Gọi sau khi ghi thành công, để màn hình làm mới bill / khoản trả. */
  onPaid: (message: string) => Promise<void> | void;
  onDone: () => void;
  onFailure: (message: string) => void;
  /** Có thì tờ thanh toán có thêm nút "Chọn các khoản thanh toán" (trang vào chế độ tích chọn). */
  onSelectItems?: () => void;
}

/**
 * Bảng thanh toán của một cặp trên trang Thanh toán bill (thẻ tổng nằm ở trang): dùng lại
 * `PaymentPanel` (tờ đáy hai nút Thanh toán toàn bộ / một phần, rồi thẻ xác nhận / nhập số). Ghi bằng `recordBillPairPaymentSynced`, tính lại số còn lại lúc ghi.
 */
export function BillPaymentPanel({ pair, period, onSelectItems, onPaid, onDone, onFailure }: PanelProps) {
  return (
    <>
      <PaymentPanel
        remaining={pair.remaining}
        payer={pair.from}
        receiver={pair.to}
        onSelectItems={onSelectItems}
        onPay={async (amount) => {
          const result = await recordBillPairPaymentSynced(pair.from, pair.to, period, amount);
          await onPaid(result.value.message);
        }}
        onDone={onDone}
        onFailure={(e) => onFailure(describeDebtError(e))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inner: { gap: 12 },
  spender: { gap: 6 },
  spenderTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15.5, lineHeight: 21 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  more: { alignSelf: 'center', paddingVertical: 2 },
  note: { fontSize: 12.5, lineHeight: 17 },
  pairs: { gap: 8 },
  zone: { gap: 3 },
  zoneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  zoneTitle: { fontSize: 13, lineHeight: 18 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  otherPart: { flexShrink: 1 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  /** Nhãn có đệm ngang 8: kéo sang trái 8 để CHỮ trong nhãn thẳng hàng với tên bên trên. */
  pairAmount: { fontSize: 17, lineHeight: 23 },
});
