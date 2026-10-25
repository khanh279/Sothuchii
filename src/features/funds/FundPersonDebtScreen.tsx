import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailNotice } from '@/components/detail-parts';
import { EmptyState, PrimaryButton, ScreenTitle, SecondaryButton } from '@/components/design';
import { PayPageFrame } from '@/components/pay-page-frame';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PAYOUT_NO_CASH_MESSAGE, advanceSummary, overflowExpense, fundPersonBalances, fundPersonTargets } from '@/domain/fundAdvance';
import { PERSON_ITEM_LABEL, buildPersonFundDetail, filterPersonDetailBySide, type PersonDebtSide, type PersonFundItem } from '@/domain/fundPerson';
import { FundPayFlow, isFundPayBlocked } from '@/features/funds/FundPayFlow';
import { useFundData } from '@/features/funds/hooks';
import { AdvanceSpendCard, advanceSpendItems } from '@/features/funds/AdvanceSpendCard';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Chi tiết công nợ quỹ của MỘT người (mở khi chạm người đó ở thẻ Công nợ quỹ; tham số route `person` và `fund` = `all` hoặc id quỹ): thẻ tổng "Quỹ nợ" /
 * "Đang giữ ứng", bảng tổng hợp (quỹ giao ứng, chi từ tiền ứng, cá nhân ứng chi, hoàn tiền, quỹ trả) và danh sách từng khoản tương ứng (`buildPersonFundDetail`).
 * Còn khoản cần xử lý thì có nút Thanh toán cố định ở cuối trang mở tờ nổi thanh toán (`FundPayFlow`: nhiều khoản thì chọn khoản trước; rồi toàn bộ / một phần);
 * thanh toán xong thì ở lại trang và số liệu cập nhật.
 */
export default function FundPersonDebtScreen() {
  const { person = '', fund = 'all', side: sideParam } = useLocalSearchParams<{ person?: string; fund?: string; side?: string }>();
  /** Phía đang xem: 'owed' (quỹ nợ), 'held' (nợ quỹ) hoặc không có (cả hai, link cũ). */
  const side: PersonDebtSide | undefined = sideParam === 'owed' || sideParam === 'held' ? sideParam : undefined;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();
  const [payOpen, setPayOpen] = useState(false);
  const isHeld = side === 'held';
  /** Trang "Nợ quỹ": đang mở danh sách các lần giao dưới dòng "Tổng giao A ứng". */
  const [lotsOpen, setLotsOpen] = useState(false);

  const balance = useMemo(() => fundPersonBalances(data, fund).find((item) => item.person === person.trim()), [data, fund, person]);
  const detail = useMemo(() => {
    const full = buildPersonFundDetail(data, fund, person);
    return side ? filterPersonDetailBySide(full, side) : full;
  }, [data, fund, person, side]);
  const targets = useMemo(() => fundPersonTargets(data, fund, person).filter((item) => !side || (item.kind === 'payout') === (side === 'owed')), [data, fund, person, side]);
  /** Có khoản thanh toán được ngay (quỹ trả cần quỹ còn tiền thực tế; hoàn tiền ứng thì luôn được). */
  const canPay = loaded && !error && !isHeld && targets.some((item) => !isFundPayBlocked(data, item));
  /** Các hồ sơ ứng trước người đó còn giữ tiền (mỗi hồ sơ một khoản hoàn tiền ứng còn lại). */
  const heldAdvances = targets.filter((item) => item.kind === 'refund' && item.advanceId);
  const noCash = targets.some((item) => isFundPayBlocked(data, item));

  /** Hoàn tiền ứng: gộp mọi lần giao của người đó thành một khoản; hoàn một phần thì trừ vào lần giao mới nhất trước. */
  function startRefund() {
    router.push({ pathname: '/quy/ung-chi', params: { mode: 'refund', person: person.trim(), fund } });
  }

  let body;
  if (error) body = <DetailNotice text={error} tone="error" />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else {
    const owed = side === 'held' ? 0 : (balance?.owed ?? 0);
    const held = side === 'owed' ? 0 : (balance?.held ?? 0);
    const rows: { label: string; value: string }[] = [];
    /** Phía "Quỹ nợ": chỉ liệt kê các khoản người đó ỨNG CHI (không có dòng tổng hợp hay khoản quỹ trả), và bỏ các khoản quỹ đã trả hết. */
    // Số còn nợ của từng khoản chi (khoản đã được quỹ trả hết thì không có trong danh sách này và bị bỏ khỏi trang).
    const remainingOf = new Map(targets.map((target) => [target.expenseId, target.remaining] as const));
    // Phía "Nợ quỹ": chỉ tính các lần giao CHƯA hoàn tất. Lần giao đã chi hết / hoàn hết (số dư về 0) coi như xong chu kỳ: không hiện nữa, các khoản phát sinh sau của người này tính lại từ đầu
    // (dữ liệu vẫn nằm trong Lịch sử quỹ, không bị xoá).
    const liveLots = (data.advances ?? [])
      .filter((item) => (fund === 'all' || item.fundId === fund) && item.person.trim() === person.trim())
      .map((item) => advanceSummary(data, item))
      .filter((summary) => summary.state !== 'settled')
      .sort((x, y) => (x.advance.date === y.advance.date ? 0 : x.advance.date < y.advance.date ? -1 : 1));
    const liveIds = new Set(liveLots.map((summary) => summary.advance.id));
    const heldGiven = liveLots.reduce((total, summary) => total + summary.given, 0);
    const heldSpent = liveLots.reduce((total, summary) => total + summary.spent, 0);
    const heldRefunded = liveLots.reduce((total, summary) => total + summary.refunded, 0);
    const spendItems = isHeld ? advanceSpendItems(data, fund, person).filter((entry) => !!entry.advanceId && liveIds.has(entry.advanceId)) : detail.items.filter((entry) => entry.kind === 'advanceSpend');
    // Trang "Nợ quỹ": các lần giao ứng chưa chi hết (khoản đã chi hết không hiện; lịch sử quỹ vẫn lưu đủ).
    // Phía "Quỹ nợ": thêm các khoản A chi VƯỢT số tiền được giao (quỹ nợ phần vượt); chạm để xem vì sao nợ.
    // Khoản chi làm vượt: tên + ngày hiện ở ghi chú nhỏ dưới dòng.
    const spendOver = (target: (typeof targets)[number]) => overflowExpense(data, target.fundId, person);
    const overflowItems: ListItem[] =
      side === 'owed'
        ? targets
            .filter((target) => target.kind === 'payout' && target.advanceId)
            .map((target) => ({
              kind: 'overflow',
              id: target.advanceId ?? '',
              title: 'Chi vượt tiền ứng',
              date: spendOver(target)?.date ?? target.date,
              note: spendOver(target)?.title,
              amount: target.remaining,
            }))
        : [];
    const items: ListItem[] =
      side === 'owed'
        ? [...detail.items.filter((entry) => entry.kind === 'personalSpend' && remainingOf.has(entry.id)), ...overflowItems]
        : isHeld
          ? [] // Trang "Nợ quỹ": khối riêng (xem `HeldLine`), không dùng danh sách chung.
          : detail.items;
    if (!isHeld && side !== 'owed' && detail.given > 0) rows.push({ label: 'Quỹ đã giao ứng', value: formatVnd(detail.given) });
    if (!isHeld && side !== 'owed' && detail.spentFromAdvance > 0) rows.push({ label: 'Đã chi từ tiền ứng', value: formatVnd(detail.spentFromAdvance) });
    if (!isHeld && side !== 'owed' && detail.spentPersonal > 0) rows.push({ label: 'Cá nhân ứng tiền túi chi', value: formatVnd(detail.spentPersonal) });
    if (!isHeld && side !== 'owed' && detail.refunded > 0) rows.push({ label: 'Đã hoàn lại quỹ', value: formatVnd(detail.refunded) });
    if (!isHeld && side !== 'owed' && detail.paid > 0) rows.push({ label: 'Quỹ đã trả', value: formatVnd(detail.paid) });
    body = (
      <>
        <PayPageFrame
          label={
            owed > 0 ? 'Quỹ đang nợ' : held > 0 ? 'Đang giữ tiền ứng' : side === 'owed' ? 'Quỹ không còn nợ' : side === 'held' ? 'Không còn giữ tiền ứng' : 'Không còn công nợ'
          }
          amount={formatVnd(owed > 0 ? owed : held)}
          amountColor={owed > 0 ? colors.danger : held > 0 ? colors.warning : undefined}
          caption={owed > 0 && held > 0 ? `Đang giữ ứng ${formatVnd(held)}` : undefined}
          detailsTitle={side === 'owed' ? `Các khoản ${person} ứng chi` : isHeld ? undefined : `Các khoản · ${person}`}
          detailsCount={isHeld ? undefined : `${items.length} khoản`}
        >
          {rows.length > 0 && (
            <View style={styles.summary}>
              {rows.map((row) => (
                <View key={row.label} style={styles.summaryRow}>
                  <AppText color={colors.muted} style={styles.itemSub}>
                    {row.label}
                  </AppText>
                  <AppText weight="semibold" style={styles.itemSub}>
                    {row.value}
                  </AppText>
                </View>
              ))}
            </View>
          )}
          {isHeld ? (
            liveLots.length === 0 ? (
              <EmptyState text="Chưa có khoản nào" icon="check" />
            ) : (
              <View>
                <HeldLine label={`Tổng giao ${person} ứng`} value={formatVnd(heldGiven)} bold open={lotsOpen} onPress={() => setLotsOpen((open) => !open)} />
                {lotsOpen &&
                  liveLots.map((summary) => (
                    <HeldLine key={summary.advance.id} sub label={`Ngày ${formatVnDate(summary.advance.date)}`} value={formatVnd(summary.given)} />
                  ))}
                <HeldLine label={`${person} đã chi`} value={formatVnd(heldSpent)} bold top />
                <HeldLine label={`${person} hoàn tiền`} value={formatVnd(heldRefunded)} bold top />
              </View>
            )
          ) : items.length === 0 ? (
            <EmptyState text="Chưa có khoản nào" icon="check" />
          ) : (
            <View>
              {items.map((entry, index) => (
                <Pressable
                  key={`${entry.kind}:${entry.id}`}
                  disabled={entry.kind !== 'overflow'}
                  accessibilityRole={entry.kind === 'overflow' ? 'button' : undefined}
                  onPress={() => router.push({ pathname: '/quy/chi-tiet', params: { kind: 'overflow', id: entry.id } })}
                  style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
                >
                  <View style={styles.flex}>
                    <AppText weight="semibold" style={styles.itemTitle} numberOfLines={2}>
                      {entry.title}
                    </AppText>
                    <AppText color={colors.muted} style={styles.itemSub}>
                      {entry.kind === 'overflow'
                        ? [entry.note, formatVnDate(entry.date)].filter(Boolean).join(' · ')
                        : isHeld
                          ? (entry.note ?? '')
                          : side === 'owed'
                            ? formatVnDate(entry.date)
                            : `${PERSON_ITEM_LABEL[entry.kind]} · ${formatVnDate(entry.date)}`}
                    </AppText>
                  </View>
                  <View style={styles.itemRight}>
                    <AppText weight="bold" color={entry.kind === 'refund' ? colors.success : entry.kind === 'payout' ? colors.muted : undefined} style={styles.itemAmount}>
                      {formatVnd(entry.amount)}
                    </AppText>
                    {/* Khoản đã được quỹ trả một phần: ghi chú nhỏ số ĐÃ THANH TOÁN ngay dưới số tiền. */}
                    {side === 'owed' && (remainingOf.get(entry.id) ?? entry.amount) < entry.amount && (
                      <AppText color={colors.warning} style={styles.itemSub}>
                        Đã thanh toán {formatVnd(entry.amount - (remainingOf.get(entry.id) ?? 0))}
                      </AppText>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </PayPageFrame>
        {noCash && <DetailNotice text={PAYOUT_NO_CASH_MESSAGE} tone="error" />}
        {isHeld && heldAdvances.length > 0 && (
          <View style={styles.actions}>
            <PrimaryButton label="+ Thêm khoản chi" onPress={() => router.push({ pathname: '/quy/ung-chi', params: { mode: 'expense', person: person.trim(), fund } })} />
            <SecondaryButton label="Hoàn tiền ứng" onPress={startRefund} />
          </View>
        )}
        {isHeld && <AdvanceSpendCard title={`Quỹ giao ${person} ứng chi`} items={spendItems} reload={reload} />}
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Công nợ quỹ', headerShown: false }} />
      <ScreenTitle
        title={!person ? 'Công nợ quỹ' : side === 'owed' ? `Quỹ nợ ${person}` : side === 'held' ? `${person} nợ quỹ` : `Công nợ quỹ · ${person}`}
        topInset={insets.top}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay ? PAY_ACTION_BAR_CLEARANCE : 0) }]}>{body}</ScrollView>
      <PayActionBar visible={canPay} bottom={16} onPress={() => setPayOpen(true)} />
      {payOpen && <FundPayFlow data={data} person={person.trim()} scope={fund} side={side} reload={reload} onClose={() => setPayOpen(false)} />}
    </View>
  );
}

/**
 * Một dòng của khối "Tiền giao ứng" ở trang Nợ quỹ: nhãn bên trái, số tiền bên phải. `bold` = dòng tiêu đề nhóm (in đậm); `sub` = dòng chi tiết nhỏ bên dưới nhóm
 * (`note` = ghi chú nhỏ dưới nhãn, vd. ngày); `top` kẻ đường mảnh phía trên để tách nhóm.
 */
function HeldLine({
  label,
  value,
  bold,
  sub,
  note,
  top,
  open,
  onPress,
}: {
  label: string;
  value: string;
  bold?: boolean;
  sub?: boolean;
  note?: string;
  top?: boolean;
  /** Có `onPress` thì dòng là nút mở / đóng danh sách bên dưới (`open` = đang mở, hiện mũi tên). */
  open?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { expanded: !!open } : undefined}
      onPress={onPress}
      style={[styles.heldLine, top && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <View style={styles.flex}>
        <AppText weight={bold ? 'semibold' : undefined} color={bold ? colors.ink : colors.muted} style={sub ? styles.itemSub : styles.itemTitle} numberOfLines={2}>
          {label}
        </AppText>
        {!!note && (
          <AppText color={colors.muted} style={styles.itemSub}>
            {note}
          </AppText>
        )}
      </View>
      <AppText weight={bold ? 'bold' : 'semibold'} style={sub ? styles.itemSub : styles.itemAmount}>
        {value}
      </AppText>
      {onPress && (
        <AppText color={colors.muted} style={styles.itemSub}>
          {open ? '▴' : '▾'}
        </AppText>
      )}
    </Pressable>
  );
}

/** Dòng trong danh sách chi tiết: các loại của `buildPersonFundDetail` và 'overflow' = phần A chi vượt số tiền được giao (quỹ nợ). */
type ListItem = Omit<PersonFundItem, 'kind'> & { kind: PersonFundItem['kind'] | 'overflow'; note?: string };

const styles = StyleSheet.create({
  actions: { gap: 10 },
  heldLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  summary: { gap: 4, paddingBottom: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  itemTitle: { fontSize: 15, lineHeight: 20 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemRight: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 15 },
});
