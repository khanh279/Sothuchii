import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { EmptyState, Panel, SectionHeader, TransactionRow } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { buildRecentTransactions, type RecentTransaction } from '@/domain/recentTransactions';
import { resolveCategory } from '@/domain/expenses';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { addDays, formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Số dòng hiện ở Tổng quan, và số ngày gần nhất được đọc để tìm các dòng đó. */
const RECENT_LIMIT = 5;
const RECENT_DAYS = 60;

interface Props {
  /** Các khoản trả đã đọc ở Tổng quan (cùng nguồn với khung Công nợ). */
  pays: readonly Pay[];
  /** Nguồn khoản trả đã đọc xong chưa / lỗi (nếu có). */
  paysLoaded: boolean;
  paysError: string | null;
}

/**
 * Khu vực "Giao dịch gần đây" ở Tổng quan: các giao dịch tiền mới nhất của tôi (khoản chi cá nhân và khoản chuyển / trả tiền), gộp bằng
 * `buildRecentTransactions` từ nguồn đã có (không kho dữ liệu riêng, không lặp khoản chi là bóng của khoản trả). Tự đọc lại mỗi khi
 * Tổng quan được mở lại, nên cập nhật sau khi thêm / sửa / xoá. Chạm khoản chi mở chi tiết; chạm khoản trả mở lịch sử giao dịch.
 */
export function RecentTransactions({ pays, paysLoaded, paysError }: Props) {
  const colors = useColors();
  const today = todayStr();
  const window = useMemo<Period>(() => ({ mode: 'custom', from: addDays(today, -(RECENT_DAYS - 1)), to: today }), [today]);
  const { items, loaded, error } = useExpenses(window);
  const { settings } = useExpenseSettings();

  const list = useMemo(
    () => buildRecentTransactions({ expenses: items, pays, categoryName: (id) => resolveCategory(settings, id).name, limit: RECENT_LIMIT }),
    [items, pays, settings],
  );
  const failed = error ?? paysError;

  function open(item: RecentTransaction) {
    if (item.expense) router.push({ pathname: '/chi-tieu/chi-tiet', params: { m: item.expense.m, id: item.expense.id } });
    else router.push({ pathname: '/cong-no/lich-su', params: { mode: 'all' } });
  }

  return (
    <>
      <SectionHeader title="Giao dịch gần đây" subtitle="Chi tiêu và chuyển tiền của bạn" actionLabel="Xem tất cả" onAction={() => router.push('/chi-tieu')} />
      <Panel>
        {failed ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
            <AppText color={colors.danger} style={styles.noticeText}>
              {failed}
            </AppText>
          </View>
        ) : !loaded || !paysLoaded ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : list.length === 0 ? (
          <EmptyState text="Chưa có giao dịch nào gần đây" icon="check" />
        ) : (
          list.map((item, index) => {
            const out = item.flow === 'out';
            return (
              <TransactionRow
                key={item.key}
                first={index === 0}
                icon={
                  item.categoryId ? (
                    <CategoryIcon category={resolveCategory(settings, item.categoryId)} />
                  ) : (
                    <View style={[styles.payIcon, { backgroundColor: out ? colors.dangerSoft : colors.successSoft }]}>
                      <SvgIcon name="tabTransactions" size={20} color={out ? colors.danger : colors.success} strokeWidth={1.9} />
                    </View>
                  )
                }
                title={item.title}
                subtitle={item.subtitle === item.typeLabel ? item.typeLabel : item.typeLabel + ' · ' + item.subtitle}
                amount={`${out ? '−' : '+'}${formatVnd(item.amount)}`}
                tone={out ? 'owe' : 'get'}
                meta={formatVnDate(item.date)}
                accessibilityLabel={`${item.title}, ${out ? 'chi' : 'nhận'} ${formatVnd(item.amount)}, ${formatVnDate(item.date)}`}
                onPress={() => open(item)}
              />
            );
          })
        )}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 28 },
  notice: { borderRadius: 12, padding: 14, marginVertical: 8 },
  noticeText: { fontSize: 14 },
  payIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
