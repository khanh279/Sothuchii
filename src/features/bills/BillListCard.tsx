import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { CardHead, ChipRow, EmptyState } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { computeSplit } from '@/domain/bills';
import { billTotal, type buildBillHistory } from '@/domain/billHistory';
import { dayHeading, periodTitle, resolveCategory } from '@/domain/expenses';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import { formatVnDate, todayStr } from '@/utils/date';
import { AppRadius } from '@/constants/palette';
import { formatVnd } from '@/utils/format';

type RowProps = ReturnType<typeof import('@/hooks/use-single-open-row').useSingleOpenRow>['rowProps'];

interface Props {
  title: string;
  period: Period;
  /** Kết quả `buildBillHistory` (đã lọc theo phạm vi cần hiện). */
  history: ReturnType<typeof buildBillHistory>;
  /** Bill đã thanh toán hết chưa (nhãn trên mỗi dòng). */
  settledOf: (id: string) => boolean;
  rowProps: RowProps;
  onRemove: (id: string) => void;
  /** Dòng phụ của mỗi bill: "Phần tôi …" (tab, trang thanh toán) hay "Tổng bill" (màn Lịch sử bill). */
  showMyShare?: boolean;
  /** Nút lọc theo tên người, dưới tiêu đề (không truyền = không có thanh lọc). Nút "Tất cả" ở đầu để bỏ lọc. */
  people?: { names: readonly string[]; selected: string; onSelect: (name: string) => void };
}

/** Phần của người dùng ("Tôi", người đầu tiên) trong bill: số tiền họ phải chịu; bill chưa chia được thì chỉ ghi nhãn tổng. */
function myShareText(bill: Bill): string {
  const split = computeSplit(bill.people);
  const mine = split.bad ? undefined : split.rows[0];
  return mine ? `Phần tôi ${formatVnd(mine.share)}` : 'Tổng bill';
}

/**
 * Thẻ danh sách bill gom theo ngày (đầu thẻ `CardHead` + các dòng `HistoryCard`: chạm mở chi tiết, vuốt để Sửa / Xóa). Dùng chung cho tab Chia bill,
 * màn Lịch sử bill và trang Thanh toán bill, để ba nơi hiển thị giống hệt nhau.
 */
export function BillListCard({ title, period, history, settledOf, rowProps, onRemove, showMyShare = true, people }: Props) {
  const colors = useColors();
  const today = todayStr();
  const { settings } = useExpenseSettings();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.summary}>
        <CardHead title={title} subtitle={periodTitle(period)} rightTop={`${history.count} bill`} rightBottom={formatVnd(history.totalPaid)} />
      </View>
      {!!people && people.names.length > 0 && (
        <View style={styles.chips}>
          <ChipRow options={[{ value: '', label: 'Tất cả' }, ...people.names.map((name) => ({ value: name, label: name }))]} value={people.selected} onChange={people.onSelect} />
        </View>
      )}

      <View style={styles.body}>
        {history.days.length === 0 ? (
          <EmptyState text="Không có bill trong khoảng này" icon="check" />
        ) : (
          history.days.map((day) => (
            <View key={day.date}>
              <View style={styles.dayHeader}>
                <AppText color={colors.muted} style={styles.dayName} numberOfLines={1}>
                  <AppText weight="semibold" style={styles.dayName}>
                    {dayHeading(day.date, today)}
                  </AppText>
                  , {formatVnDate(day.date)}
                </AppText>
                <AppText color={colors.muted} style={styles.dayName}>
                  {formatVnd(day.total)}
                </AppText>
              </View>
              <View style={styles.rows}>
                {day.bills.map((bill) => {
                  const category = resolveCategory(settings, bill.cat);
                  const props = rowProps(bill.id);
                  return (
                    <HistoryCard
                      key={bill.id}
                      {...props}
                      onPressRow={() => {
                        props.onPressRow();
                        router.push({ pathname: '/chia-bill/chi-tiet', params: { id: bill.id } });
                      }}
                      onEdit={() => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } })}
                      onDelete={() => onRemove(bill.id)}
                      accessibilityLabel={`${bill.title || 'Không tên'}, ${category.name}, ${formatVnd(billTotal(bill))}`}
                      icon={<CategoryIcon category={category} />}
                      title={bill.title || 'Không tên'}
                      subtitle={`${formatVnDate(bill.date)} · ${bill.people.length} người`}
                      badge={settledOf(bill.id) ? 'Đã thanh toán' : 'Chưa thanh toán'}
                      badgeTone={settledOf(bill.id) ? 'get' : 'owe'}
                      amount={formatVnd(billTotal(bill))}
                      meta={showMyShare ? myShareText(bill) : 'Tổng bill'}
                    />
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  summary: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  chips: { paddingBottom: 4 },
  body: { paddingHorizontal: 12, paddingBottom: 8 },
  /** Khoảng trên tiêu đề ngày lớn hơn khoảng dưới để tiêu đề thuộc về nhóm bên dưới. */
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2, marginTop: 8, marginBottom: 4 },
  dayName: { flexShrink: 1, fontSize: 13, lineHeight: 18.85 },
  rows: { gap: 6 },
});
