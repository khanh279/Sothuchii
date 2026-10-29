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
import { buildDebtPeopleSplit, type DebtPersonSplit } from '@/domain/debtOverview';
import { isNearZero } from '@/domain/ledger';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

/**
 * Trang "Chi tiết nợ & bill" (mở từ nút ở thẻ "Các khoản nợ & bill" của tab Nợ & bill): nợ THEO NGƯỜI, toàn thời gian. Hai thẻ — "Nợ tôi" (người khác phải trả tôi) rồi "Tôi nợ" (tôi phải trả) —
 * mỗi thẻ có tổng bên phải tiêu đề và mỗi người một dòng: tên, tổng nợ (nợ vay + nợ bill, đúng con số ở thẻ Nợ của tab) và dòng phụ cho biết nợ gồm những gì. Chạm một người mở chi tiết nợ với người đó
 * (hai ngăn Nợ vay / Nợ bill, thanh toán). Người hai sổ bù nhau về 0 không hiện. Không có logic tính nợ riêng: dùng `buildDebtPeopleSplit`.
 */

/** Dòng phụ: phần nợ vay / nợ bill còn khác 0 của người này, có dấu (+ họ nợ tôi, − tôi nợ họ). */
function breakdownText(person: DebtPersonSplit): string {
  const part = (label: string, value: number) => `${label} ${value > 0 ? '+' : '−'}${formatVnd(Math.abs(value))}`;
  return [!isNearZero(person.loan) && part('Nợ vay', person.loan), !isNearZero(person.bill) && part('Nợ bill', person.bill)].filter(Boolean).join(' · ');
}

/** Dòng một người: tên + dòng phụ bên trái, tổng nợ có dấu / màu và mũi tên bên phải. */
function PersonRow({ person, onOpen }: { person: DebtPersonSplit; onOpen: (name: string) => void }) {
  const colors = useColors();
  const get = person.tone === 'get';
  const note = breakdownText(person);
  return (
    <SelectableCard
      selected={false}
      onPress={() => onOpen(person.name)}
      accessibilityLabel={`Chi tiết nợ với ${person.name}, ${get ? 'nợ tôi' : 'tôi nợ'} ${formatVnd(Math.abs(person.total))}`}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText weight="semibold" style={styles.rowName} numberOfLines={1}>
            {person.name}
          </AppText>
          {!!note && (
            <AppText color={colors.muted} style={styles.rowNote} numberOfLines={1}>
              {note}
            </AppText>
          )}
        </View>
        <AppText weight="bold" color={get ? colors.success : colors.danger} style={styles.amount}>
          {get ? '+' : '−'}
          {formatVnd(Math.abs(person.total))}
        </AppText>
        <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
      </View>
    </SelectableCard>
  );
}

/** Thẻ lớn của một hướng nợ: tiêu đề + tổng bên phải (có dấu, màu), rồi danh sách người; trống thì hiện trạng thái trống. */
function DirectionCard({ title, tone, people, onOpen }: { title: string; tone: 'get' | 'owe'; people: readonly DebtPersonSplit[]; onOpen: (name: string) => void }) {
  const colors = useColors();
  const total = people.reduce((sum, person) => sum + Math.abs(person.total), 0);
  const body: ReactNode =
    people.length === 0 ? <EmptyState text="Không có khoản nào" icon="check" /> : people.map((person) => <PersonRow key={person.name} person={person} onOpen={onOpen} />);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <AppText weight="bold" style={styles.cardTitle}>
            {title}
          </AppText>
          <AppText color={colors.muted} style={styles.cardNote}>
            {people.length} người
          </AppText>
        </View>
        <AppText weight="bold" color={tone === 'get' ? colors.success : colors.danger} style={styles.cardTotal}>
          {tone === 'get' ? '+' : '−'}
          {formatVnd(total)}
        </AppText>
      </View>
      {body}
    </View>
  );
}

export default function DebtBillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error } = useDebtData();

  const people = useMemo(() => buildDebtPeopleSplit(bills, pays), [bills, pays]);
  const owedToMe = useMemo(() => people.filter((person) => person.tone === 'get'), [people]);
  const iOwe = useMemo(() => people.filter((person) => person.tone === 'owe'), [people]);
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
          <DirectionCard title="Nợ tôi" tone="get" people={owedToMe} onOpen={open} />
          <DirectionCard title="Tôi nợ" tone="owe" people={iOwe} onOpen={open} />
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
  card: { borderRadius: AppRadius.card, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  cardTitle: { fontSize: 17, lineHeight: 24 },
  cardNote: { fontSize: 12.5, lineHeight: 17 },
  cardTotal: { fontSize: 17, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  rowNote: { fontSize: 12.5, lineHeight: 17 },
  amount: { fontSize: 17, lineHeight: 23 },
});
