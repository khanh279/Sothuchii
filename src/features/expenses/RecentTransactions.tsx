import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { EmptyState, SectionCard, TransactionRow } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { resolveCategory } from '@/domain/expenses';
import type { RecentTransaction } from '@/domain/recentTransactions';
import { useTransactionFeed } from '@/features/expenses/useTransactionFeed';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseSettings, Period } from '@/types/expense';
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

/** Một dòng giao dịch (dùng chung ở Tổng quan và trang Giao dịch): biểu tượng theo loại, nội dung, số tiền có dấu và ngày. CHỈ XEM, không bấm mở gì. */
export function TransactionItemRow({ item, settings, first }: { item: RecentTransaction; settings: ExpenseSettings; first: boolean }) {
  const colors = useColors();
  const out = item.flow === 'out';
  return (
    <TransactionRow
      first={first}
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
    />
  );
}

/**
 * Khu vực "Giao dịch gần đây" ở Tổng quan: các giao dịch tiền mới nhất gộp từ HAI nguồn: chi tiêu cá nhân và giao dịch (trả bill, chuyển tiền)
 * (`useTransactionFeed`, không kho dữ liệu riêng, không lặp khoản chi là bóng của khoản trả). Tự đọc lại mỗi khi Tổng quan được mở lại.
 * "Xem tất cả" mở trang Giao dịch riêng.
 */
export function RecentTransactions({ pays, paysLoaded, paysError }: Props) {
  const colors = useColors();
  const today = todayStr();
  const window = useMemo<Period>(() => ({ mode: 'custom', from: addDays(today, -(RECENT_DAYS - 1)), to: today }), [today]);
  const { list, settings, loaded, error } = useTransactionFeed({ window, pays, paysLoaded, paysError, limit: RECENT_LIMIT });

  return (
    <SectionCard title="Giao dịch gần đây" subtitle="Chi tiêu cá nhân và giao dịch" actionLabel="Xem tất cả" onAction={() => router.push('/giao-dich')}>
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : list.length === 0 ? (
        <EmptyState text="Chưa có giao dịch nào gần đây" icon="check" />
      ) : (
        <View>
          {list.map((item, index) => (
            <TransactionItemRow key={item.key} item={item} settings={settings} first={index === 0} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 28 },
  notice: { borderRadius: 12, padding: 14 },
  noticeText: { fontSize: 14 },
  payIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
