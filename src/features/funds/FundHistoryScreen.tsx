import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailLink } from '@/components/detail-link';
import { EmptyState, ScreenTitle, SectionCard, TitleAction } from '@/components/design';
import { OptionSheet } from '@/components/option-sheet';
import { PeriodNote } from '@/components/period-filter';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { fundPersonBalances, fundPosition } from '@/domain/fundAdvance';
import { buildFundHistory, fundSpendBreakdown, settlementOf, type FundSpendBreakdown } from '@/domain/fundHistory';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

/** Màu thu / chi của Quỹ (`--in`, `--out` của PWA). */

/**
 * Trang một quỹ nhóm (hoặc tất cả quỹ): (1) thẻ Tổng quan (thu, chi trong kỳ chọn và một số còn lại thực tế của quỹ; kỳ đổi bằng cách bấm ghi chú ngày dưới tiêu đề thẻ, cùng kỳ dùng chung của cả ứng dụng);
 * (2) thẻ Công nợ quỹ: từng người quỹ đang nợ / đang giữ ứng, chạm một người để mở trang chi tiết công nợ của người đó; (3) nút "Lịch sử quỹ" mở trang Lịch sử quỹ (mọi khoản ghi nhận của quỹ
 * của quỹ, có bộ lọc theo loại, vuốt Sửa / Xoá). Tham số route: `fund` (`all` hoặc id quỹ).
 */
export default function FundHistoryScreen() {
  const params = useLocalSearchParams<{ fund?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { view, setView, period } = useSharedPeriod();

  const { data, loaded, error } = useFundData();
  /** Tờ chọn Thu quỹ / Chi tiêu quỹ của nút "+ Thu, chi quỹ" (chỉ khi xem một quỹ). */
  const [txnOpen, setTxnOpen] = useState(false);

  const history = useMemo(() => buildFundHistory(data, params.fund || 'all', period), [data, params.fund, period]);
  const single = history.filter !== 'all' ? history.funds[0] : null;

  const spend = useMemo(() => fundSpendBreakdown(data, history.filter === 'all' ? 'all' : history.filter, period), [data, history.filter, period]);
  const position = fundPosition(data, history.filter === 'all' ? 'all' : history.filter);
  const balances = fundPersonBalances(data, history.filter === 'all' ? 'all' : history.filter);
  /** Mỗi khoản một hàng: "Quỹ nợ" (quỹ nợ người đó, đỏ) hoặc "Nợ quỹ" (người đó đang giữ tiền ứng của quỹ, cam); một người có cả hai thì có hai hàng. */
  const debtRows = balances.flatMap((item) => [
    ...(item.owed > 0 ? [{ person: item.person, kind: 'owed' as const, amount: item.owed }] : []),
    ...(item.held > 0 ? [{ person: item.person, kind: 'held' as const, amount: item.held }] : []),
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Quỹ nhóm', headerShown: false }} />
      <ScreenTitle title={single ? single.name : 'Chi tiêu quỹ'} topInset={insets.top} right={single ? <TitleAction label="Thu, chi quỹ" onPress={() => setTxnOpen(true)} /> : undefined} />
      {txnOpen && single && (
        <OptionSheet
          title="Thu, chi quỹ"
          onClose={() => setTxnOpen(false)}
          options={[
            { icon: 'wallet', label: 'Thu quỹ', onPress: () => router.push({ pathname: '/quy/thu-quy', params: { fund: single.id } }) },
            { icon: 'people', label: 'Chi tiêu quỹ', onPress: () => router.push({ pathname: '/quy/chi-tieu', params: { fund: single.id } }) },
          ]}
        />
      )}
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          <SectionCard title="Tổng quan" subtitleNode={<PeriodNote view={view} onChange={setView} today={today} />} rightTop={single ? undefined : `${history.funds.length} quỹ`}>
            <View>
              <InfoRow label="Thu trong kỳ" value={`+${formatVnd(history.totalIn)}`} color={colors.success} first />
              {/* Chi trong kỳ = chi trực tiếp + khoản cá nhân ứng chi (quỹ nợ) + phần cá nhân đã chi thực tế từ tiền quỹ giao (tổng giao − phần còn nợ quỹ). */}
              <SpendRow spend={spend} />
              {/* Còn lại = số còn lại thực tế của quỹ (toàn thời gian: tổng thu − mọi khoản chi đã ghi), cũng là số dư ở danh sách quỹ; có thể âm. */}
              <InfoRow label="Còn lại" value={formatVnd(position.cash)} color={position.cash < 0 ? colors.danger : undefined} bold />
            </View>
          </SectionCard>

          <SectionCard title="Công nợ quỹ" subtitle="Toàn thời gian">
            {balances.length === 0 ? (
              <EmptyState text="Không có khoản nợ hay tiền ứng nào chưa xử lý" icon="check" />
            ) : (
              <View style={styles.debtSections}>
                {(['owed', 'held'] as const).map((kind) => {
                  const rows = debtRows.filter((row) => row.kind === kind);
                  if (rows.length === 0) return null;
                  const tint = kind === 'owed' ? colors.danger : colors.warning;
                  const label = kind === 'owed' ? 'Quỹ nợ' : 'Nợ quỹ';
                  return (
                    <View key={kind} style={styles.debtSection}>
                      <View style={styles.debtSectionHead}>
                        <AppText weight="semibold" color={colors.muted} style={styles.debtSectionTitle}>
                          {label}
                        </AppText>
                        <View style={styles.debtSectionTotal}>
                          <AppText weight="bold" color={tint} style={styles.debtSectionAmount}>
                            {formatVnd(rows.reduce((sum, row) => sum + row.amount, 0))}
                          </AppText>
                        </View>
                      </View>
                      <View style={styles.debtList}>
                        {rows.map((row) => (
                          <SelectableCard
                            key={`${row.person}:${row.kind}`}
                            selected={false}
                            onPress={() => router.push({ pathname: '/quy/cong-no', params: { person: row.person, fund: history.filter, side: row.kind } })}
                            accessibilityLabel={`${row.person}: ${label} ${formatVnd(row.amount)}`}
                          >
                            <View style={styles.debtRow}>
                              <AppText weight="semibold" style={[styles.rowText, styles.rowName]} numberOfLines={1}>
                                {row.person}
                              </AppText>
                              <AppText weight="bold" color={tint} style={styles.debtAmount}>
                                {formatVnd(row.amount)}
                              </AppText>
                              <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
                            </View>
                          </SelectableCard>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </SectionCard>

          <DetailLink label="Lịch sử quỹ" onPress={() => router.push({ pathname: '/quy/lich-su-quy', params: { fund: history.filter } })} />
        </LockableScrollView>
      )}
    </View>
  );
}

/** Dòng nhãn – giá trị của thẻ Tổng quan và chi tiết công nợ: nhãn xám bên trái, giá trị đậm (có thể tô màu) bên phải, ngăn bằng đường mảnh. */
/** "Chi trong kỳ": bấm để mở / thu gọn danh sách thành phần (chi trực tiếp, cá nhân ứng chi, giao cá nhân chi). */
function SpendRow({ spend }: { spend: FundSpendBreakdown }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  // Ghi chú dưới số tiền của cá nhân ứng chi: đã quyết toán (xanh) / chưa quyết toán (đỏ) / còn nợ … (cam); không có khoản nào thì không ghi chú.
  const settlement = settlementOf(spend.personalOwed, spend.personalRemaining);
  const personalNote =
    settlement === 'settled'
      ? { note: 'Đã quyết toán' as string | undefined, noteColor: colors.success }
      : settlement === 'unsettled'
        ? { note: 'Chưa quyết toán' as string | undefined, noteColor: colors.danger }
        : settlement === 'partial'
          ? { note: `Còn nợ ${formatVnd(spend.personalRemaining)}` as string | undefined, noteColor: colors.warning }
          : { note: undefined as string | undefined, noteColor: colors.muted };
  return (
    <View style={[styles.spendBox, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.infoRow}>
        <AppText color={colors.muted} style={styles.infoLabel}>
          Chi trong kỳ
        </AppText>
        <View style={styles.spendValue}>
          <AppText weight="semibold" color={colors.danger} style={styles.infoValue}>
            {`−${formatVnd(spend.total)}`}
          </AppText>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={2.2} />
          </View>
        </View>
      </Pressable>
      {open && (
        <View style={styles.spendList}>
          {[
            { label: 'Chi trực tiếp', value: `−${formatVnd(spend.direct)}`, color: colors.danger, note: undefined as string | undefined, noteColor: colors.muted },
            { label: 'Cá nhân ứng chi', value: `−${formatVnd(spend.personal)}`, color: colors.danger, ...personalNote },
            { label: 'Giao cá nhân chi', value: `−${formatVnd(spend.advance)}`, color: colors.danger, note: `Tổng giao ${formatVnd(spend.given)}`, noteColor: colors.muted },
          ].map((row) => (
            <View key={row.label} style={styles.spendItem}>
              <AppText color={colors.muted} style={styles.infoLabel}>
                {row.label}
              </AppText>
              <View style={styles.spendItemRight}>
                <AppText weight="semibold" color={row.color} style={styles.infoValue}>
                  {row.value}
                </AppText>
                {!!row.note && (
                  <AppText color={row.noteColor} style={styles.spendNote}>
                    {row.note}
                  </AppText>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function InfoRow({ label, value, color, bold, first }: { label: string; value: string; color?: string; bold?: boolean; first?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <AppText color={colors.muted} style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText weight={bold ? 'bold' : 'semibold'} color={color} style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

// Số đo theo CSS `.mod-b` của PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64, bo 14, biểu tượng 40×40 bo 12.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  spendBox: {},
  spendValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spendList: { paddingLeft: 12, paddingBottom: 6 },
  spendItem: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  spendItemRight: { alignItems: 'flex-end' },
  spendNote: { fontSize: 12, lineHeight: 16 },
  infoRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { flexShrink: 1, fontSize: 14 },
  infoValue: { fontSize: 15, textAlign: 'right' },
  debtSections: { gap: 14 },
  debtSection: { gap: 6 },
  debtSectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  debtSectionTitle: { fontSize: 13, lineHeight: 18 },
  debtSectionTotal: { alignItems: 'flex-end' },
  debtSectionAmount: { fontSize: 11, lineHeight: 15 },
  debtList: { gap: 8 },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Cùng khuôn với danh sách Thanh toán bill (Chia bill) và Chi tiết nợ (Công nợ): tên cùng chiều cao dòng với số tiền. */
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  debtAmount: { fontSize: 17, lineHeight: 23 },
  debtDetail: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  debtItemsTitle: { fontSize: 13.5, marginTop: 8 },
  debtItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  debtItemTitle: { fontSize: 14, lineHeight: 19 },
  debtItemSub: { fontSize: 12, lineHeight: 16 },
  debtItemAmount: { fontSize: 14.5 },
});
