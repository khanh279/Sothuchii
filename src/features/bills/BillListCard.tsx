import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { CardHead, ChipRow, EmptyState } from '@/components/design';
import { HistoryCard } from '@/components/history-card';
import { SvgIcon } from '@/components/svg-icon';
import { computeSplit } from '@/domain/bills';
import { billTotal, type buildBillHistory } from '@/domain/billHistory';
import { TRANSFER_STATE_LABEL, type TransferPayState } from '@/domain/billPayment';
import { dayHeading, periodTitle, resolveCategory } from '@/domain/expenses';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import { formatVnDate, todayStr } from '@/utils/date';
import { AppRadius } from '@/constants/palette';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

/** Màu nhãn: đã thanh toán xanh lá, chưa thanh toán đỏ, một phần vàng cam (như chi tiết bill). */
const STATE_TONE: Record<TransferPayState, 'get' | 'owe' | 'warn'> = { paid: 'get', unpaid: 'owe', partial: 'warn' };

type RowProps = ReturnType<typeof import('@/hooks/use-single-open-row').useSingleOpenRow>['rowProps'];

interface Props {
  title: string;
  period: Period;
  /** Kết quả `buildBillHistory` (đã lọc theo phạm vi cần hiện). */
  history: ReturnType<typeof buildBillHistory>;
  /** Trạng thái thanh toán của bill (nhãn trên mỗi dòng): đã thanh toán / thanh toán một phần (đã có giao dịch trả, chưa xong) / chưa thanh toán. */
  stateOf: (id: string) => TransferPayState;
  rowProps: RowProps;
  onRemove: (id: string) => void;
  /** Dòng phụ của mỗi bill: "Phần tôi …" (tab, trang thanh toán) hay "Tổng bill" (màn Lịch sử bill). */
  showMyShare?: boolean;
  /** Thay dòng kỳ dưới tiêu đề thẻ bằng một phần tử tuỳ ý (ví dụ ghi chú kỳ bấm được `PeriodNote`); không truyền = dòng chữ kỳ như cũ. */
  subtitleNode?: ReactNode;
  /** Nút lọc theo tên người, dưới tiêu đề (không truyền = không có thanh lọc). Nút "Tất cả" ở đầu để bỏ lọc. */
  people?: { names: readonly string[]; selected: string; onSelect: (name: string) => void };
  /** Chế độ chọn bill để gộp: mỗi dòng có ô tích (trượt ra), chạm dòng để tích / bỏ tích (không mở chi tiết, không vuốt Sửa / Xóa). Không truyền = chế độ thường (ô tích thu lại). */
  selection?: { selected: ReadonlySet<string>; onToggle: (id: string) => void };
}

/** Bề rộng phần trượt của ô tích: ô 24 + khoảng cách 8 tới dòng bill. */
const CHECK_SLOT = 32;

/** Tiến độ 0 → 1 khi `active` bật (chạy mượt, cả lúc thu lại): dùng cho ô tích trượt ra. */
function useSlide(active: boolean): Animated.Value {
  const [value] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    Animated.timing(value, { toValue: active ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, active]);
  return value;
}

/** Phần của người dùng ("Tôi", người đầu tiên) trong bill: số tiền họ phải chịu; bill chưa chia được thì chỉ ghi nhãn tổng. */
function myShareText(bill: Bill): string | undefined {
  const split = computeSplit(bill.people);
  const mine = split.bad ? undefined : split.rows[0];
  return mine ? `Phần tôi ${formatVnd(mine.share)}` : undefined;
}

/**
 * Thẻ danh sách bill gom theo ngày (đầu thẻ `CardHead` + các dòng `HistoryCard`: chạm mở chi tiết, vuốt để Sửa / Xóa). Dùng chung cho tab Chia bill,
 * màn Lịch sử bill và trang Thanh toán bill, để ba nơi hiển thị giống hệt nhau.
 */
export function BillListCard({ title, period, history, stateOf, rowProps, onRemove, showMyShare = true, people, selection, subtitleNode }: Props) {
  const colors = useColors();
  const today = todayStr();
  const { settings } = useExpenseSettings();
  const selecting = !!selection;
  const slide = useSlide(selecting);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.summary}>
        <CardHead title={title} subtitle={periodTitle(period)} subtitleNode={subtitleNode} rightTop={`${history.count} bill`} rightBottom={formatVnd(history.totalPaid)} />
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
                  const checked = !!selection?.selected.has(bill.id);
                  const toggle = () => selection?.onToggle(bill.id);
                  return (
                    <View key={bill.id} style={styles.billRow}>
                      {/* Ô tích: trượt ra từ mép trái khi vào chế độ chọn (bề rộng và độ mờ chạy theo `slide`), thu lại khi thoát. */}
                      <Animated.View
                        pointerEvents={selecting ? 'auto' : 'none'}
                        accessibilityElementsHidden={!selecting}
                        importantForAccessibility={selecting ? 'auto' : 'no-hide-descendants'}
                        style={[styles.checkSlot, { width: slide.interpolate({ inputRange: [0, 1], outputRange: [0, CHECK_SLOT] }), opacity: slide }]}>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={bill.title || 'Không tên'}
                          hitSlop={8}
                          onPress={toggle}
                          style={[styles.checkbox, checked ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.line }]}>
                          {checked && <SvgIcon name="check" size={16} color={colors.primaryInk} strokeWidth={2.6} />}
                        </Pressable>
                      </Animated.View>
                      <View style={styles.billCard}>
                        <HistoryCard
                          {...(selecting
                            ? { open: false, onOpen: toggle, onClose: () => undefined, onPressRow: toggle, locked: true, onPressLocked: toggle, onEdit: () => undefined, onDelete: () => undefined }
                            : {
                                ...props,
                                onPressRow: () => {
                                  props.onPressRow();
                                  router.push({ pathname: '/chia-bill/chi-tiet', params: { id: bill.id } });
                                },
                                onEdit: () => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } }),
                                onDelete: () => onRemove(bill.id),
                              })}
                          accessibilityLabel={`${bill.title || 'Không tên'}, ${category.name}, ${formatVnd(billTotal(bill))}`}
                          icon={<CategoryIcon category={category} />}
                          title={bill.title || 'Không tên'}
                          subtitle={`${formatVnDate(bill.date)} · ${bill.people.map((person) => person.name).join(', ')}`}
                          // Đang chọn gộp: thẻ co lại vì ô tích nên tiêu đề / dòng phụ chỉ một dòng, dài quá thì cắt bằng "…"; nhãn trạng thái dùng cỡ nhỏ.
                          singleLineTitle={selecting}
                          singleLineSubtitle={selecting}
                          smallBadge
                          badge={TRANSFER_STATE_LABEL[stateOf(bill.id)]}
                          badgeTone={STATE_TONE[stateOf(bill.id)]}
                          amount={formatVnd(billTotal(bill))}
                          meta={showMyShare ? myShareText(bill) : undefined}
                        />
                      </View>
                    </View>
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
  billRow: { flexDirection: 'row', alignItems: 'center' },
  checkSlot: { overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'center' },
  billCard: { flex: 1, minWidth: 0 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
