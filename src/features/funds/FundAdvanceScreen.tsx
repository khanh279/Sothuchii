import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ModalHeader, Panel, PrimaryButton, ScreenTitle, SecondaryButton, SectionHeader, StatusBadge, type StatusTone } from '@/components/design';
import { HistoryCard, IconTile } from '@/components/history-card';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteAdvanceSynced, deleteFundExpenseSynced, deleteFundTxnSynced } from '@/data/fundService';
import { ADVANCE_STATE_LABEL, advanceById, advanceSummary, type AdvanceState } from '@/domain/fundAdvance';
import { fundBalance } from '@/domain/funds';
import { FundActionSheet, type FundActionTarget } from '@/features/funds/FundActionSheet';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import type { FundExpense } from '@/types/fund';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu trạng thái quyết toán: đã quyết toán xanh lá, một phần vàng cam, chưa quyết toán đỏ (cùng hệ màu trạng thái của Chia bill). */
export const ADVANCE_TONE: Record<AdvanceState, StatusTone> = { settled: 'get', partial: 'warn', unsettled: 'owe' };

/**
 * Chi tiết MỘT hồ sơ ứng trước (tham số route `id`): thông tin hồ sơ, tổng hợp quyết toán (đã giao, chi thực tế, đã hoàn, quỹ trả thêm, còn lại
 * chưa quyết toán, trạng thái), các khoản chi thực tế và giao dịch hoàn tiền / thanh toán gắn với hồ sơ. Từ đây thêm khoản chi từ tiền ứng,
 * hoàn tiền thừa hoặc quỹ trả thêm. Mọi con số do `advanceSummary` tính; màn hình không có logic tính tiền riêng.
 */
export default function FundAdvanceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data, loaded, error, reload } = useFundData();
  const { closeAll, rowProps } = useSingleOpenRow();
  const [action, setAction] = useState<FundActionTarget | null>(null);
  const [editing, setEditing] = useState<FundExpense | null>(null);

  const advance = advanceById(data, id ?? '');
  const summary = advance ? advanceSummary(data, advance) : null;
  const fund = advance ? data.funds.find((item) => item.id === advance.fundId) : undefined;

  async function run(task: () => Promise<unknown>, done: string) {
    try {
      await task();
      closeAll();
      toast.show(done, { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeFundError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  let body;
  if (error) body = <Notice text={error} />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!advance || !summary) body = <Notice text="Không tìm thấy hồ sơ ứng trước này. Có thể nó đã bị xoá." />;
  else {
    const empty = summary.expenses.length === 0 && summary.txns.length === 0;
    const rest =
      summary.balance > 0
        ? { label: 'Cá nhân còn giữ tiền ứng', value: formatVnd(summary.held), color: colors.warning }
        : summary.balance < 0
          ? { label: 'Quỹ còn nợ cá nhân', value: formatVnd(summary.owed), color: colors.danger }
          : { label: 'Chưa quyết toán còn lại', value: formatVnd(0), color: colors.success };
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} onScrollBeginDrag={closeAll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.infoTop}>
            <View style={styles.flex}>
              <AppText weight="semibold" style={styles.title} numberOfLines={2}>
                {advance.title || 'Giao tiền ứng'}
              </AppText>
              <AppText color={colors.muted} style={styles.sub}>
                {advance.person} · {formatVnDate(advance.date)}
                {fund ? ` · ${fund.name}` : ''}
              </AppText>
            </View>
            <StatusBadge label={ADVANCE_STATE_LABEL[summary.state]} tone={ADVANCE_TONE[summary.state]} />
          </View>
          <View style={styles.totalRow}>
            <AppText weight="medium" color={colors.muted} style={styles.label}>
              Tổng tiền quỹ đã giao
            </AppText>
            <AppText weight="display" style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
              {formatVnd(summary.given)}
            </AppText>
          </View>
        </View>

        <View>
          <SectionHeader title="Quyết toán" subtitle="Giao, chi thực tế, hoàn tiền và thanh toán" />
          <Panel>
            <SummaryRow label="Tổng chi thực tế" value={formatVnd(summary.spent)} first />
            <SummaryRow label="Đã hoàn lại quỹ" value={formatVnd(summary.refunded)} />
            <SummaryRow label="Quỹ đã trả thêm cho cá nhân" value={formatVnd(summary.paidExtra)} />
            <SummaryRow label={rest.label} value={rest.value} color={rest.color} bold />
          </Panel>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="+ Thêm khoản chi" onPress={() => setAction({ mode: 'expense', advanceId: advance.id, fundId: advance.fundId })} />
          {summary.held > 0 && <SecondaryButton label="Hoàn tiền ứng" onPress={() => setAction({ mode: 'refund', advanceId: advance.id, max: summary.held })} />}
          {summary.owed > 0 && <SecondaryButton label={`Quỹ trả thêm cho ${advance.person}`} onPress={() => setAction({ mode: 'payout', advanceId: advance.id, person: advance.person, max: summary.owed })} />}
        </View>

        <View>
          <SectionHeader title="Khoản chi thực tế" subtitle="Tính vào tổng chi quỹ, đã nằm trong lịch sử chi" />
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {summary.expenses.length === 0 ? (
              <Panel>
                <EmptyState text="Chưa có khoản chi nào từ tiền ứng này" icon="check" />
              </Panel>
            ) : (
              summary.expenses.map((item) => (
                <HistoryCard
                  key={item.id}
                  {...rowProps(item.id)}
                  onEdit={() => setEditing(item)}
                  onDelete={() => void run(() => deleteFundExpenseSynced(item.id), 'Đã xóa khoản chi')}
                  accessibilityLabel={`${item.title}, ${formatVnd(item.amount)}`}
                  icon={<RowIcon sign="−" tone="owe" />}
                  title={item.title || 'Chi quỹ'}
                  subtitle={`${item.payer || advance.person} · ${formatVnDate(item.date)}`}
                  amount={`−${formatVnd(item.amount)}`}
                  tone="owe"
                />
              ))
            )}
          </View>
        </View>

        {summary.txns.length > 0 && (
          <View>
            <SectionHeader title="Hoàn tiền và thanh toán" subtitle="Chỉ đổi tiền quỹ và công nợ, không tính vào tổng chi" />
            <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              {summary.txns.map((item) => (
                <HistoryCard
                  key={item.id}
                  {...rowProps(item.id)}
                  onEdit={() => toast.show('Muốn sửa, hãy xoá giao dịch này rồi ghi lại', { bottom: TOAST_BOTTOM_HISTORY })}
                  onDelete={() => void run(() => deleteFundTxnSynced(item.id), 'Đã xóa giao dịch')}
                  accessibilityLabel={`${item.kind === 'refund' ? 'Hoàn tiền' : 'Thanh toán'}, ${formatVnd(item.amount)}`}
                  icon={<RowIcon sign={item.kind === 'refund' ? '+' : '−'} tone={item.kind === 'refund' ? 'get' : 'owe'} />}
                  title={item.kind === 'refund' ? 'Hoàn tiền ứng' : `Quỹ trả cho ${item.person}`}
                  subtitle={formatVnDate(item.date)}
                  amount={`${item.kind === 'refund' ? '+' : '−'}${formatVnd(item.amount)}`}
                  tone={item.kind === 'refund' ? 'get' : 'owe'}
                />
              ))}
            </View>
          </View>
        )}

        {empty && (
          <SecondaryButton label="Xoá hồ sơ ứng trước" onPress={() => void run(async () => deleteAdvanceSynced(advance.id).then(() => router.back()), 'Đã xóa hồ sơ')} />
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Hồ sơ ứng trước', headerShown: false }} />
      <ScreenTitle title="Hồ sơ ứng trước" topInset={insets.top} />
      {body}

      {action && (
        <FundActionSheet
          target={action}
          data={data}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void reload();
          }}
        />
      )}
      {editing && advance && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setEditing(null)}>
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <Pressable style={styles.flex} onPress={() => setEditing(null)} accessibilityLabel="Đóng" />
            <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                <ModalHeader title="Sửa chi tiêu quỹ" onClose={() => setEditing(null)} />
                {data.funds.find((item) => item.id === advance.fundId) && (
                  <FundExpenseForm
                    fund={data.funds.find((item) => item.id === advance.fundId)!}
                    existing={editing}
                    showTitle={false}
                    balance={fundBalance(data, advance.fundId)}
                    onChanged={() => {
                      setEditing(null);
                      void reload();
                    }}
                  />
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function SummaryRow({ label, value, color, bold, first }: { label: string; value: string; color?: string; bold?: boolean; first?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.summaryRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <AppText weight={bold ? 'semibold' : 'regular'} style={styles.summaryLabel} numberOfLines={2}>
        {label}
      </AppText>
      <AppText weight="bold" color={color} style={styles.summaryValue}>
        {value}
      </AppText>
    </View>
  );
}

function RowIcon({ sign, tone }: { sign: '+' | '−'; tone: 'get' | 'owe' }) {
  const colors = useColors();
  const fg = tone === 'get' ? colors.success : colors.danger;
  return (
    <IconTile color={fg}>
      <AppText weight="bold" color={fg} style={styles.iconText}>
        {sign}
      </AppText>
    </IconTile>
  );
}

function Notice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
      <AppText color={colors.danger} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 16, gap: 14 },
  infoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  totalRow: { gap: 2 },
  label: { fontSize: 12.5, lineHeight: 17 },
  total: { fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  summaryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  summaryLabel: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  summaryValue: { fontSize: 15.5, lineHeight: 22 },
  actions: { gap: 10 },
  list: { gap: 6, padding: 8, borderRadius: AppRadius.card, borderWidth: 1 },
  row: { borderRadius: AppRadius.field, overflow: 'hidden', paddingHorizontal: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, lineHeight: 24 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  sheetContent: { padding: 16, gap: 12 },
});
