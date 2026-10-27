import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailLink } from '@/components/detail-link';
import { EmptyState, ScreenTitle, SectionCard } from '@/components/design';
import { PeriodNote } from '@/components/period-filter';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { fundPersonBalances, fundPosition } from '@/domain/fundAdvance';
import { buildFundHistory, filterCashMovementDays, fundCashSummary } from '@/domain/fundHistory';
import { useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu thu / chi của Quỹ (`--in`, `--out` của PWA). */

/**
 * Trang một quỹ nhóm (hoặc tất cả quỹ): (1) thẻ Tổng quan (thu, chi trong kỳ chọn, số dư và tiền thực tế; kỳ đổi bằng cách bấm ghi chú ngày dưới tiêu đề thẻ, cùng kỳ dùng chung của cả ứng dụng);
 * (2) thẻ Công nợ quỹ: từng người quỹ đang nợ / đang giữ ứng, chạm một người để mở trang chi tiết công nợ của người đó; (3) nút "Lịch sử quỹ" mở trang Lịch sử quỹ (các khoản làm đổi số dư thực tế
 * của quỹ, có bộ lọc theo loại, vuốt Sửa / Xoá). Tham số route: `fund` (`all` hoặc id quỹ).
 */
export default function FundHistoryScreen() {
  const params = useLocalSearchParams<{ fund?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { view, setView, period } = useSharedPeriod();

  const { data, loaded, error } = useFundData();

  const history = useMemo(() => buildFundHistory(data, params.fund || 'all', period), [data, params.fund, period]);
  const single = history.filter !== 'all' ? history.funds[0] : null;

  const position = fundPosition(data, history.filter === 'all' ? 'all' : history.filter);
  const balances = fundPersonBalances(data, history.filter === 'all' ? 'all' : history.filter);
  /** Mỗi khoản một hàng: "Quỹ nợ" (quỹ nợ người đó, đỏ) hoặc "Nợ quỹ" (người đó đang giữ tiền ứng của quỹ, cam); một người có cả hai thì có hai hàng. */
  const debtRows = balances.flatMap((item) => [
    ...(item.owed > 0 ? [{ person: item.person, kind: 'owed' as const, amount: item.owed }] : []),
    ...(item.held > 0 ? [{ person: item.person, kind: 'held' as const, amount: item.held }] : []),
  ]);
  // Chi trong kỳ / giao cá nhân ứng của thẻ Tổng quan chỉ tính các khoản làm đổi số dư thực tế của quỹ.
  const cashDays = useMemo(() => filterCashMovementDays(history.days, data), [history.days, data]);
  const cashSummary = fundCashSummary(cashDays);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Quỹ nhóm', headerShown: false }} />
      <ScreenTitle title={single ? single.name : 'Chi tiêu quỹ'} topInset={insets.top} />
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
              <InfoRow label="Chi trong kỳ" value={`−${formatVnd(cashSummary.spent)}`} color={colors.danger} />
              {position.advanced && <InfoRow label="Giao cá nhân ứng" value={`−${formatVnd(cashSummary.given)}`} color={colors.warning} />}
              {/* Còn lại = tiền đang có trong quỹ (toàn thời gian), cũng là số dư hiện ở danh sách quỹ; trừ nợ cá nhân còn lại là số dư thực tế. */}
              <InfoRow label="Còn lại" value={formatVnd(position.cash)} bold />
              {position.advanced && <InfoRow label="Nợ cá nhân" value={`−${formatVnd(position.owed)}`} color={colors.danger} />}
              {position.advanced && <InfoRow label="Số dư thực tế" value={formatVnd(position.cash - position.owed)} color={position.cash - position.owed < 0 ? colors.danger : position.cash - position.owed > 0 ? colors.success : undefined} bold />}
            </View>
          </SectionCard>

          <SectionCard title="Công nợ quỹ" subtitle="Toàn thời gian" rightTop={debtRows.length > 0 ? `${debtRows.length} khoản` : undefined}>
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
                        <AppText color={colors.muted} style={styles.debtSectionTitle}>
                          {rows.length} người
                        </AppText>
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
  infoRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { flexShrink: 1, fontSize: 14 },
  infoValue: { fontSize: 15, textAlign: 'right' },
  debtSections: { gap: 14 },
  debtSection: { gap: 6 },
  debtSectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  debtSectionTitle: { fontSize: 13, lineHeight: 18 },
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
