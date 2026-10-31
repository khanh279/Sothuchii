import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PeriodNote } from '@/components/period-filter';
import { ScreenTitle, TitleAction } from '@/components/design';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { TOAST_BOTTOM_HISTORY, useToast } from '@/components/toast';
import { PageLayout } from '@/constants/layout';
import { buildBillPairs } from '@/domain/billPairs';
import { deleteBillSynced } from '@/data/billService';
import { billPayState, billTransferStatuses } from '@/domain/billPayment';
import { billPeopleNames, buildBillHistory, filterBillsByPerson } from '@/domain/billHistory';
import { MIN_MERGE_BILLS } from '@/domain/billMerge';
import { describeBillError } from '@/features/bills/hooks';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import type { Period } from '@/types/expense';
import { BillListCard } from '@/features/bills/BillListCard';
import { BillOverviewSection, BillPairsSection } from '@/features/bills/BillPairsPanel';
import { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { todayStr } from '@/utils/date';
import { router } from '@/utils/safe-router';

/**
 * Lịch sử Chia bill trong một kỳ (khung "Chia bill" của trang Lịch sử PWA): bill gom theo ngày, mới nhất trước.
 * Chạm một bill để mở màn Chi tiết bill (theo mã bill). Vuốt dòng sang trái để hiện Sửa / Xóa (Xóa bấm hai lần);
 * chỉ một dòng mở tại một thời điểm. Xóa bill sẽ dọn khoản chi cá nhân đã tạo từ bill đó.
 */
export interface BillHistoryTabMode {
  /** Kỳ đang xem (do tab giữ, không lấy từ tham số route). */
  period: Period;
  /** Đầu trang (tiêu đề + bộ chọn kỳ). */
  header: ReactNode;
}

export default function BillHistoryScreen({ tab }: { tab?: BillHistoryTabMode } = {}) {
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // Kỳ DÙNG CHUNG của cả ứng dụng; đổi bằng cách bấm ghi chú ngày dưới tiêu đề thẻ.
  const shared = useSharedPeriod();
  const period = tab ? tab.period : shared.period;
  const { bills, pays, loaded, error, reload } = useDebtData();
  const { closeAll, rowProps } = useSingleOpenRow();
  // Gộp bill: bấm "Gộp các bill" ở đáy thì vào chế độ chọn (mỗi bill có ô tích), chọn xong bấm lại để mở bill gộp.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);

  // Trạng thái thanh toán chung của từng bill (đọc từ khoản trả thực tế, theo quy tắc phân bổ có sẵn): hiện ở nhãn mỗi bill.
  const transfers = useMemo(() => billTransferStatuses(bills, pays), [bills, pays]);
  const stateOf = (id: string) => billPayState(transfers.get(id));
  // Phần B (chỉ ở tab): các cặp còn phải thanh toán; chạm một cặp để mở trang thanh toán. Phạm vi cặp = bill của kỳ có khoản chuyển giữa hai người.
  const pairs = useMemo(() => (tab ? buildBillPairs(bills, pays, period) : []), [tab, bills, pays, period]);
  // Lọc theo tên người: tên lấy từ các bill của kỳ; người đã chọn mà không còn trong kỳ thì coi như không lọc.
  const [personPick, setPersonPick] = useState('');
  const periodBills = useMemo(() => buildBillHistory(bills, period).days.flatMap((day) => day.bills), [bills, period]);
  const personNames = useMemo(() => billPeopleNames(periodBills), [periodBills]);
  const person = personNames.includes(personPick) ? personPick : '';
  const history = useMemo(() => buildBillHistory(filterBillsByPerson(bills, person), period), [bills, period, person]);

  function stopSelecting() {
    setSelecting(false);
    setPicked([]);
  }

  function pressMerge() {
    if (!selecting) {
      closeAll();
      setSelecting(true);
      return;
    }
    if (picked.length < MIN_MERGE_BILLS) return;
    const ids = picked.join(',');
    stopSelecting();
    router.push({ pathname: '/chia-bill/gop', params: { ids } });
  }

  async function remove(id: string) {
    try {
      await deleteBillSynced(id);
      closeAll();
      toast.show('Đã xóa', { bottom: TOAST_BOTTOM_HISTORY });
      await reload();
    } catch (e) {
      toast.show(describeBillError(e), { bottom: TOAST_BOTTOM_HISTORY });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 0 }]}>
      {!tab && <Stack.Screen options={{ title: 'Danh sách bill', headerShown: false }} />}
      {!tab && (
        <ScreenTitle
          title="Danh sách bill"
          topInset={insets.top}
          right={
            selecting ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn bill" hitSlop={8} onPress={stopSelecting} style={styles.cancel}>
                <AppText weight="semibold" color={colors.danger} style={styles.cancelText}>
                  Hủy
                </AppText>
              </Pressable>
            ) : (
              <TitleAction label="Tạo bill" onPress={() => router.push('/chia-bill/tao')} />
            )
          }
        />
      )}
      {tab?.header}
      {error ? (
        <View style={[styles.notice, styles.tabNotice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView
          contentContainerStyle={[styles.content, styles.tabContent, { paddingBottom: (tab ? PageLayout.bottomClearance : 24 + PAY_ACTION_BAR_CLEARANCE) + insets.bottom }]}
          onScrollBeginDrag={closeAll}>
          {tab && (
            <View style={styles.section}>
              <BillOverviewSection bills={bills} period={period} />
            </View>
          )}
          {tab && (
            <View style={styles.section}>
              <BillPairsSection
                pairs={pairs}
                period={period}
                onOpen={(key) => {
                  closeAll();
                  router.push({ pathname: '/chia-bill/thanh-toan', params: { pair: key } });
                }}
              />
            </View>
          )}
          <BillListCard
            title={person || 'Tất cả'}
            subtitleNode={tab ? undefined : <PeriodNote view={shared.view} onChange={shared.setView} today={today} />}
            period={period}
            history={history}
            stateOf={stateOf}
            rowProps={rowProps}
            onRemove={(id) => void remove(id)}
            showMyShare={!!tab}
            people={{ names: personNames, selected: person, onSelect: (name) => { closeAll(); setPersonPick(name); } }}
            selection={
              selecting
                ? {
                    selected: new Set(picked),
                    onToggle: (id) => setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id])),
                  }
                : undefined
            }
          />
        </LockableScrollView>
      )}
      <PayActionBar
        visible={!tab && loaded && !error && history.count >= MIN_MERGE_BILLS}
        label={selecting ? `Gộp ${picked.length} bill` : 'Gộp các bill'}
        disabled={selecting && picked.length < MIN_MERGE_BILLS}
        bottom={16}
        onPress={pressMerge}
      />
    </View>
  );
}

// Số đo theo `.mod-c` / lịch sử PWA: thẻ bo 16 viền 1; tóm tắt cao 64; dòng cao 64 bo 14 biểu tượng 40.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 8 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  /** Khoảng giữa các phần A / B và danh sách bill ở tab Chia bill. */
  section: { marginBottom: PageLayout.gap },
  /** Ở tab Chia bill, lề ngang và đệm trên theo `PageLayout` như 4 trang gốc còn lại (màn Lịch sử bill riêng giữ lề 12). */
  tabContent: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop },
  cancel: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 16, lineHeight: 22 },
  tabNotice: { marginHorizontal: PageLayout.paddingX, marginTop: PageLayout.contentTop },
});
