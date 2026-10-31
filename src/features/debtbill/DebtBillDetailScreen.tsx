import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CardHead, ChipRow, EmptyState, ScreenTitle, TitleAction } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildBillPairs } from '@/domain/billPairs';
import { buildDebtPeopleSplit, type DebtPersonSplit } from '@/domain/debtOverview';
import { isNearZero } from '@/domain/ledger';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

/**
 * Trang "Chi tiết nợ & bill" (mở từ nút ở thẻ "Các khoản nợ & bill" của tab Nợ & bill): nợ THEO NGƯỜI, toàn thời gian, trong MỘT thẻ như các trang lịch sử khác — tiêu đề thẻ theo tên thẻ lọc đang chọn
 * (Tất cả / Nợ vay / Nợ bill), thẻ lọc ngay dưới, rồi hai phần "Nợ tôi" (người khác phải trả tôi) và "Tôi nợ" (tôi phải trả), mỗi người một dòng.
 * Chạm một dòng mở trang tương ứng: thẻ "Tất cả" gom theo người, chạm cả khung mở chi tiết toàn bộ khoản nợ với người ấy; thẻ "Nợ vay" mở công nợ vay, thẻ "Nợ bill" mở trang thanh toán bill của người ấy.
 * Không có logic tính nợ riêng: dùng \`buildDebtPeopleSplit\` và \`buildBillPairs\`.
 */
const ALL_TIME: Period = { mode: 'all' };

type Book = 'loan' | 'bill';
type Filter = 'all' | Book;

/** Thẻ lọc; tên thẻ cũng là tiêu đề của thẻ. */
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'loan', label: 'Nợ vay' },
  { value: 'bill', label: 'Nợ bill' },
];
const BOOK_LABEL: Record<Book, string> = { loan: 'Nợ vay', bill: 'Nợ bill' };

/** Một dòng: một người ở một sổ (số dương; chiều do phần "Nợ tôi" / "Tôi nợ" quyết định). */
interface DebtLine {
  name: string;
  book: Book;
  amount: number;
}

/** Các dòng của chiều `dir` (+1 họ nợ tôi, −1 tôi nợ họ) ở những sổ nằm trong bộ lọc, lớn nhất trước. */
function linesOf(people: readonly DebtPersonSplit[], filter: Filter, dir: 1 | -1): DebtLine[] {
  const lines: DebtLine[] = [];
  for (const person of people) {
    for (const book of ['loan', 'bill'] as const) {
      if (filter !== 'all' && filter !== book) continue;
      if (isNearZero(person[book]) || Math.sign(person[book]) !== dir) continue;
      lines.push({ name: person.name, book, amount: Math.abs(person[book]) });
    }
  }
  return lines.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name) || a.book.localeCompare(b.book));
}

/** Một phần của thẻ ("Nợ tôi" / "Tôi nợ"): nhãn + tổng có dấu, rồi các dòng; không có dòng nào thì không hiện. Thẻ "Tất cả" ghi thêm loại nợ dưới tên. */
function Section({ title, tone, lines, showBook, onOpen }: { title: string; tone: 'get' | 'owe'; lines: readonly DebtLine[]; showBook: boolean; onOpen: (line: DebtLine) => void }) {
  const colors = useColors();
  if (lines.length === 0) return null;
  const sign = tone === 'get' ? '+' : '−';
  const color = tone === 'get' ? colors.success : colors.danger;
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText weight="semibold" color={colors.muted} style={styles.sectionTitle}>
          {title}
        </AppText>
        <AppText weight="semibold" color={color} style={styles.sectionTotal}>
          {sign}
          {formatVnd(total)}
        </AppText>
      </View>
      {lines.map((line) => (
        <SelectableCard
          key={`${line.book}:${line.name}`}
          selected={false}
          onPress={() => onOpen(line)}
          accessibilityLabel={`${BOOK_LABEL[line.book]} với ${line.name}, ${tone === 'get' ? 'nợ tôi' : 'tôi nợ'} ${formatVnd(line.amount)}`}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText weight="semibold" style={styles.rowName} numberOfLines={1}>
                {line.name}
              </AppText>
              {showBook && (
                <AppText color={colors.muted} style={styles.rowNote} numberOfLines={1}>
                  {BOOK_LABEL[line.book]}
                </AppText>
              )}
            </View>
            <AppText weight="bold" color={color} style={styles.amount}>
              {sign}
              {formatVnd(line.amount)}
            </AppText>
            <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
          </View>
        </SelectableCard>
      ))}
    </View>
  );
}

/** Nhóm theo người ở thẻ "Tất cả": tên + tổng nợ (nợ vay + nợ bill) ở đầu, bên dưới từng loại nợ còn khác 0 với số có dấu. Chạm CẢ KHUNG mở chi tiết toàn bộ khoản nợ với người đó (không chạm riêng từng khoản). */
function PersonBlock({ person, onOpen }: { person: DebtPersonSplit; onOpen: (name: string) => void }) {
  const colors = useColors();
  const tint = (value: number) => (value > 0 ? colors.success : colors.danger);
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${formatVnd(Math.abs(value))}`;
  const books = (['loan', 'bill'] as const).filter((book) => !isNearZero(person[book]));
  const detail = books.map((book) => `${BOOK_LABEL[book]} ${signed(person[book])}`).join(', ');
  return (
    <SelectableCard selected={false} onPress={() => onOpen(person.name)} accessibilityLabel={`Chi tiết nợ với ${person.name}, ${detail}`}>
      <View style={styles.blockHead}>
        <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
          {person.name}
        </AppText>
        <AppText weight="bold" color={person.tone === 'mid' ? colors.ink : tint(person.total)} style={styles.amount}>
          {person.tone === 'mid' ? formatVnd(0) : signed(person.total)}
        </AppText>
        <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
      </View>
      {books.map((book) => (
        <View key={book} style={[styles.subRow, { borderTopColor: colors.line }]}>
          <AppText color={colors.muted} style={[styles.flex, styles.rowNote]} numberOfLines={1}>
            {BOOK_LABEL[book]}
          </AppText>
          <AppText weight="semibold" color={tint(person[book])} style={styles.subAmount}>
            {signed(person[book])}
          </AppText>
        </View>
      ))}
    </SelectableCard>
  );
}

/** Phần của thẻ "Tất cả": nhóm theo người, chia "Nợ tôi" / "Tôi nợ" / "Bù nhau" theo tổng nợ của từng người. */
function PeopleSection({ title, people, tone, onOpen }: { title: string; people: readonly DebtPersonSplit[]; tone: 'get' | 'owe' | 'mid'; onOpen: (name: string) => void }) {
  const colors = useColors();
  if (people.length === 0) return null;
  const total = people.reduce((sum, person) => sum + Math.abs(person.total), 0);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText weight="semibold" color={colors.muted} style={styles.sectionTitle}>
          {title}
        </AppText>
        {tone !== 'mid' && (
          <AppText weight="semibold" color={tone === 'get' ? colors.success : colors.danger} style={styles.sectionTotal}>
            {tone === 'get' ? '+' : '−'}
            {formatVnd(total)}
          </AppText>
        )}
      </View>
      {people.map((person) => (
        <PersonBlock key={person.name} person={person} onOpen={onOpen} />
      ))}
    </View>
  );
}

export default function DebtBillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error } = useDebtData();
  const [filter, setFilter] = useState<Filter>('all');

  const people = useMemo(() => buildDebtPeopleSplit(bills, pays), [bills, pays]);
  // Thẻ "Tất cả" gom theo người nên giữ cả người hai sổ bù nhau về 0 (vẫn có từng khoản để xem).
  const everyone = useMemo(() => buildDebtPeopleSplit(bills, pays, true), [bills, pays]);
  const pairs = useMemo(() => buildBillPairs(bills, pays, ALL_TIME), [bills, pays]);
  const owed = linesOf(people, filter, 1);
  const owe = linesOf(people, filter, -1);
  const grouped = filter === 'all';
  const peopleCount = grouped ? everyone.length : new Set([...owed, ...owe].map((line) => line.name)).size;
  const sum = (lines: readonly DebtLine[]) => lines.reduce((total, line) => total + line.amount, 0);

  /** Mở trang của đúng khoản nợ: nợ vay → công nợ vay với người đó; nợ bill → trang thanh toán bill của cặp (Tôi, người đó); thiếu cặp thì mở chi tiết nợ với người đó. */
  const open = (line: DebtLine) => {
    if (line.book === 'loan') return router.push({ pathname: '/cong-no/vay', params: { name: line.name } });
    const pair = pairs.find((item) => (item.from === BILL_OWNER_NAME && item.to === line.name) || (item.to === BILL_OWNER_NAME && item.from === line.name));
    if (pair) return router.push({ pathname: '/chia-bill/thanh-toan', params: { pair: pair.key } });
    return router.push({ pathname: '/cong-no/chi-tiet', params: { name: line.name, mode: 'all' } });
  };

  /** Thẻ "Tất cả": mở chi tiết toàn bộ khoản nợ với người đó (cả nợ vay và nợ bill). */
  const openPerson = (name: string) => router.push({ pathname: '/cong-no/chi-tiet', params: { name, mode: 'all' } });

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ & bill', headerShown: false }} />
      <ScreenTitle title="Chi tiết nợ & bill" topInset={insets.top} right={<TitleAction label="Giao dịch" onPress={() => router.push('/cong-no/ghi-nhan')} />} />
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
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.head}>
              <CardHead
                title={FILTERS.find((option) => option.value === filter)?.label ?? 'Tất cả'}
                rightTop={`${peopleCount} người`}
                rightBottom={
                  <View style={styles.totals}>
                    <AppText color={colors.success} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                      +{formatVnd(sum(owed))}
                    </AppText>
                    <AppText color={colors.danger} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                      −{formatVnd(sum(owe))}
                    </AppText>
                  </View>
                }
              />
            </View>
            <View style={styles.chips}>
              <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
            </View>
            {(grouped ? everyone.length : owed.length + owe.length) === 0 ? (
              <EmptyState text="Không có khoản nợ nào" icon="check" />
            ) : (
              <View style={styles.body}>
                {grouped ? (
                  <>
                    <PeopleSection title="Nợ tôi" tone="get" people={everyone.filter((person) => person.tone === 'get')} onOpen={openPerson} />
                    <PeopleSection title="Tôi nợ" tone="owe" people={everyone.filter((person) => person.tone === 'owe')} onOpen={openPerson} />
                    <PeopleSection title="Bù nhau" tone="mid" people={everyone.filter((person) => person.tone === 'mid')} onOpen={openPerson} />
                  </>
                ) : (
                  <>
                    <Section title="Nợ tôi" tone="get" lines={owed} showBook={false} onOpen={open} />
                    <Section title="Tôi nợ" tone="owe" lines={owe} showBook={false} onOpen={open} />
                  </>
                )}
              </View>
            )}
          </View>
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
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  totals: { alignItems: 'flex-end' },
  total: { fontSize: 11, lineHeight: 15, textAlign: 'right' },
  chips: { paddingBottom: 4 },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  section: { gap: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 13, lineHeight: 18 },
  sectionTotal: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  subAmount: { fontSize: 15, lineHeight: 21 },
  flex: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  rowNote: { fontSize: 12.5, lineHeight: 17 },
  amount: { fontSize: 17, lineHeight: 23 },
});
