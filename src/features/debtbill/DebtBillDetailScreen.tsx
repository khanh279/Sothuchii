import { Stack, router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildBillPairs, type BillPair } from '@/domain/billPairs';
import { buildLoanPeople, type DebtPersonRow } from '@/domain/debtOverview';
import { TransferNames } from '@/features/bills/TransferNames';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatVnd } from '@/utils/format';

/**
 * Trang "Chi tiết nợ & bill" (mở từ nút ở thẻ "Các khoản nợ & bill" của tab Nợ & bill): sắp xếp theo hướng nợ — thẻ "Nợ tôi" (người khác phải trả tôi) rồi thẻ "Tôi nợ" (tôi phải trả),
 * mỗi thẻ có tổng bên phải tiêu đề và hai nhóm "Nợ vay" (sổ chuyển tiền, theo người) / "Nợ bill" (các cặp cần thanh toán bill); thẻ "Khác" chỉ hiện khi có khoản bù nhau hoặc cặp không có "Tôi".
 * Toàn thời gian, không có ô chọn kỳ. Chạm một người mở công nợ của họ, chạm một cặp bill mở trang thanh toán. Không có logic tính nợ riêng: dùng lại các hàm domain.
 */
/** Trang này luôn xem TẤT CẢ thời gian, không theo kỳ dùng chung và không có ô chọn kỳ. */
const ALL_TIME: Period = { mode: 'all' };

const isMine = (pair: BillPair) => pair.from === BILL_OWNER_NAME || pair.to === BILL_OWNER_NAME;

/** Một nhóm con trong thẻ: nhãn nhỏ + số lượng, rồi các dòng; không có dòng nào thì không hiện. */
function Group({ title, count, unit, children }: { title: string; count: number; unit: string; children: ReactNode }) {
  const colors = useColors();
  if (count === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <AppText weight="semibold" color={colors.muted} style={styles.groupTitle}>
          {title}
        </AppText>
        <AppText color={colors.muted} style={styles.groupCount}>
          {count} {unit}
        </AppText>
      </View>
      {children}
    </View>
  );
}

/** Dòng một người (nợ vay): tên, số tiền có dấu, mũi tên. */
function PersonRow({ person, onOpen }: { person: DebtPersonRow; onOpen: (name: string) => void }) {
  const colors = useColors();
  const tint = person.tone === 'get' ? colors.success : person.tone === 'owe' ? colors.danger : colors.ink;
  const sign = person.tone === 'get' ? '+' : person.tone === 'owe' ? '−' : '';
  return (
    <SelectableCard selected={false} onPress={() => onOpen(person.name)} accessibilityLabel={`Công nợ với ${person.name}, ${formatVnd(Math.abs(person.total))}`}>
      <View style={styles.row}>
        <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
          {person.name}
        </AppText>
        <AppText weight="bold" color={tint} style={styles.amount}>
          {sign}
          {formatVnd(Math.abs(person.total))}
        </AppText>
        <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
      </View>
    </SelectableCard>
  );
}

/** Dòng một cặp bill: có "Tôi" thì ghi tên người kia, không thì "A → B"; số tiền còn phải thanh toán. */
function PairRow({ pair, onOpen }: { pair: BillPair; onOpen: (key: string) => void }) {
  const colors = useColors();
  const iOwe = pair.from === BILL_OWNER_NAME;
  const owedToMe = pair.to === BILL_OWNER_NAME;
  const tint = owedToMe ? colors.success : iOwe ? colors.danger : colors.ink;
  return (
    <SelectableCard selected={false} onPress={() => onOpen(pair.key)} accessibilityLabel={`Thanh toán ${pair.from} trả ${pair.to} ${formatVnd(pair.remaining)}`}>
      <View style={styles.row}>
        {iOwe || owedToMe ? (
          <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
            {iOwe ? pair.to : pair.from}
          </AppText>
        ) : (
          <TransferNames from={pair.from} to={pair.to} style={styles.rowName} />
        )}
        <AppText weight="bold" color={tint} style={styles.amount}>
          {owedToMe ? '+' : iOwe ? '−' : ''}
          {formatVnd(pair.remaining)}
        </AppText>
        <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
      </View>
    </SelectableCard>
  );
}

/** Thẻ lớn: tiêu đề + tổng bên phải (có dấu, màu), rồi các nhóm con; thẻ không có khoản nào hiện trạng thái trống. */
function DirectionCard({ title, total, tone, empty, children }: { title: string; total?: number; tone?: 'get' | 'owe'; empty: boolean; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHead}>
        <AppText weight="bold" style={styles.cardTitle}>
          {title}
        </AppText>
        {total !== undefined && tone && (
          <AppText weight="bold" color={tone === 'get' ? colors.success : colors.danger} style={styles.cardTotal}>
            {tone === 'get' ? '+' : '−'}
            {formatVnd(total)}
          </AppText>
        )}
      </View>
      {empty ? <EmptyState text="Không có khoản nào" icon="check" /> : children}
    </View>
  );
}

export default function DebtBillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error } = useDebtData();

  const people = useMemo(() => buildLoanPeople(bills, pays), [bills, pays]);
  const pairs = useMemo(() => buildBillPairs(bills, pays, ALL_TIME), [bills, pays]);
  const sums = useMemo(() => {
    const owedLoans = people.filter((person) => person.tone === 'get');
    const oweLoans = people.filter((person) => person.tone === 'owe');
    const owedPairs = pairs.filter((pair) => pair.to === BILL_OWNER_NAME);
    const owePairs = pairs.filter((pair) => pair.from === BILL_OWNER_NAME);
    return {
      owedLoans,
      oweLoans,
      owedPairs,
      owePairs,
      otherLoans: people.filter((person) => person.tone !== 'get' && person.tone !== 'owe'),
      otherPairs: pairs.filter((pair) => !isMine(pair)),
      owedTotal: owedLoans.reduce((sum, person) => sum + Math.abs(person.total), 0) + owedPairs.reduce((sum, pair) => sum + pair.remaining, 0),
      oweTotal: oweLoans.reduce((sum, person) => sum + Math.abs(person.total), 0) + owePairs.reduce((sum, pair) => sum + pair.remaining, 0),
    };
  }, [people, pairs]);

  const openPerson = (name: string) => router.push({ pathname: '/cong-no/vay', params: { name } });
  const openPair = (key: string) => router.push({ pathname: '/chia-bill/thanh-toan', params: { pair: key } });
  const loanRows = (list: readonly DebtPersonRow[]) => list.map((person) => <PersonRow key={person.name} person={person} onOpen={openPerson} />);
  const pairRows = (list: readonly BillPair[]) => list.map((pair) => <PairRow key={pair.key} pair={pair} onOpen={openPair} />);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ & bill', headerShown: false }} />
      <ScreenTitle title="Chi tiết nợ & bill" topInset={insets.top} />
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
          <DirectionCard title="Nợ tôi" total={sums.owedTotal} tone="get" empty={sums.owedLoans.length + sums.owedPairs.length === 0}>
            <Group title="Nợ vay" count={sums.owedLoans.length} unit="người">
              {loanRows(sums.owedLoans)}
            </Group>
            <Group title="Nợ bill" count={sums.owedPairs.length} unit="khoản">
              {pairRows(sums.owedPairs)}
            </Group>
          </DirectionCard>
          <DirectionCard title="Tôi nợ" total={sums.oweTotal} tone="owe" empty={sums.oweLoans.length + sums.owePairs.length === 0}>
            <Group title="Nợ vay" count={sums.oweLoans.length} unit="người">
              {loanRows(sums.oweLoans)}
            </Group>
            <Group title="Nợ bill" count={sums.owePairs.length} unit="khoản">
              {pairRows(sums.owePairs)}
            </Group>
          </DirectionCard>
          {sums.otherLoans.length + sums.otherPairs.length > 0 && (
            <DirectionCard title="Khác" empty={false}>
              <Group title="Bù nhau" count={sums.otherLoans.length} unit="người">
                {loanRows(sums.otherLoans)}
              </Group>
              <Group title="Bill giữa người khác" count={sums.otherPairs.length} unit="khoản">
                {pairRows(sums.otherPairs)}
              </Group>
            </DirectionCard>
          )}
        </LockableScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: PageLayout.paddingX, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  cardTotal: { fontSize: 17, lineHeight: 24 },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupTitle: { fontSize: 13, lineHeight: 18 },
  groupCount: { fontSize: 12.5, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  amount: { fontSize: 17, lineHeight: 23 },
});
