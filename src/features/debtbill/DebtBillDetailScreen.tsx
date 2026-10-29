import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ChipRow, EmptyState, ScreenTitle } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { buildDebtPeopleSplit, type DebtPersonSplit } from '@/domain/debtOverview';
import { isNearZero } from '@/domain/ledger';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

/**
 * Trang "Chi tiết nợ & bill" (mở từ nút ở thẻ "Các khoản nợ & bill" của tab Nợ & bill): nợ THEO NGƯỜI, toàn thời gian, vẫn TÁCH RIÊNG nợ vay và nợ bill. Hai thẻ — "Nợ tôi" (người khác phải trả tôi)
 * rồi "Tôi nợ" (tôi phải trả) — mỗi thẻ có tổng bên phải tiêu đề và hai nhóm "Nợ vay" / "Nợ bill"; trong nhóm, mỗi người một dòng với số nợ CỦA RIÊNG sổ đó. Một người có cả hai loại nợ cùng chiều thì
 * có mặt ở cả hai nhóm; hai sổ trái chiều thì mỗi sổ nằm ở thẻ của chiều đó. Chạm một người mở chi tiết nợ với người đó (hai ngăn Nợ vay / Nợ bill, thanh toán). Dùng `buildDebtPeopleSplit`.
 */

type Book = 'loan' | 'bill';

/** Thẻ lọc dưới tiêu đề: xem cả hai loại nợ hoặc chỉ một loại. */
type Filter = 'all' | Book;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'loan', label: 'Nợ vay' },
  { value: 'bill', label: 'Nợ bill' },
];

/** Một dòng người trong một nhóm: tên và số nợ của riêng sổ `book` (luôn là số dương; chiều do thẻ quyết định). */
interface BookLine {
  name: string;
  amount: number;
}

/** Những người còn nợ ở sổ `book` theo chiều `dir` (+1 họ nợ tôi, −1 tôi nợ họ), lớn nhất trước. */
function linesOf(people: readonly DebtPersonSplit[], book: Book, dir: 1 | -1): BookLine[] {
  return people
    .filter((person) => !isNearZero(person[book]) && Math.sign(person[book]) === dir)
    .map((person) => ({ name: person.name, amount: Math.abs(person[book]) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/** Một nhóm con trong thẻ (Nợ vay / Nợ bill): nhãn nhỏ + số người, rồi các dòng; không có dòng nào thì không hiện. */
function Group({ title, lines, tone, onOpen }: { title: string; lines: readonly BookLine[]; tone: 'get' | 'owe'; onOpen: (name: string) => void }) {
  const colors = useColors();
  if (lines.length === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <AppText weight="semibold" color={colors.muted} style={styles.groupTitle}>
          {title}
        </AppText>
        <AppText color={colors.muted} style={styles.groupCount}>
          {lines.length} người
        </AppText>
      </View>
      {lines.map((line) => (
        <SelectableCard
          key={line.name}
          selected={false}
          onPress={() => onOpen(line.name)}
          accessibilityLabel={`${title} với ${line.name}, ${tone === 'get' ? 'nợ tôi' : 'tôi nợ'} ${formatVnd(line.amount)}`}>
          <View style={styles.row}>
            <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
              {line.name}
            </AppText>
            <AppText weight="bold" color={tone === 'get' ? colors.success : colors.danger} style={styles.amount}>
              {tone === 'get' ? '+' : '−'}
              {formatVnd(line.amount)}
            </AppText>
            <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
          </View>
        </SelectableCard>
      ))}
    </View>
  );
}

/** Thẻ lớn của một hướng nợ: tiêu đề + tổng bên phải (nợ vay + nợ bill, có dấu / màu), rồi hai nhóm tách riêng; trống thì hiện trạng thái trống. */
function DirectionCard({ title, tone, loans, bills, onOpen }: { title: string; tone: 'get' | 'owe'; loans: readonly BookLine[]; bills: readonly BookLine[]; onOpen: (name: string) => void }) {
  const colors = useColors();
  const total = [...loans, ...bills].reduce((sum, line) => sum + line.amount, 0);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHead}>
        <AppText weight="bold" style={styles.cardTitle}>
          {title}
        </AppText>
        <AppText weight="bold" color={tone === 'get' ? colors.success : colors.danger} style={styles.cardTotal}>
          {tone === 'get' ? '+' : '−'}
          {formatVnd(total)}
        </AppText>
      </View>
      {loans.length + bills.length === 0 ? (
        <EmptyState text="Không có khoản nào" icon="check" />
      ) : (
        <>
          <Group title="Nợ vay" lines={loans} tone={tone} onOpen={onOpen} />
          <Group title="Nợ bill" lines={bills} tone={tone} onOpen={onOpen} />
        </>
      )}
    </View>
  );
}

export default function DebtBillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error } = useDebtData();

  const people = useMemo(() => buildDebtPeopleSplit(bills, pays), [bills, pays]);
  const [filter, setFilter] = useState<Filter>('all');
  const lines = (book: Book, dir: 1 | -1): BookLine[] => (filter === 'all' || filter === book ? linesOf(people, book, dir) : []);
  const open = (name: string) => router.push({ pathname: '/cong-no/chi-tiet', params: { name, mode: 'all' } });

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
          <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
          <DirectionCard title="Nợ tôi" tone="get" loans={lines('loan', 1)} bills={lines('bill', 1)} onOpen={open} />
          <DirectionCard title="Tôi nợ" tone="owe" loans={lines('loan', -1)} bills={lines('bill', -1)} onOpen={open} />
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
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupTitle: { fontSize: 13, lineHeight: 18 },
  groupCount: { fontSize: 12.5, lineHeight: 17 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  cardTotal: { fontSize: 17, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  amount: { fontSize: 17, lineHeight: 23 },
});
