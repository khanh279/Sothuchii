import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AppText } from '@/components/app-text';
import { DetailNotice } from '@/components/detail-parts';
import { CheckSlot } from '@/components/check-slot';
import { EmptyState, PrimaryButton, ScreenTitle, SecondaryButton } from '@/components/design';
import { PaymentConfirmSheet } from '@/components/payment-panel';
import { PayPageFrame } from '@/components/pay-page-frame';
import { useToast } from '@/components/toast';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { advanceSummary, overflowExpense, fundPersonBalances, fundPersonTargets, personalDebt } from '@/domain/fundAdvance';
import { PERSON_ITEM_LABEL, buildPersonFundDetail, filterPersonDetailBySide, type PersonDebtSide, type PersonFundItem } from '@/domain/fundPerson';
import { PaidStack, useHiddenPaid } from '@/features/debts/PaidStack';
import { FundPayFlow, isFundPayBlocked, useFundPay } from '@/features/funds/FundPayFlow';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { AdvanceSpendCard, advanceSpendItems } from '@/features/funds/AdvanceSpendCard';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

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
  const toast = useToast();
  // Trang "Quỹ nợ": chọn các khoản quỹ nợ để thanh toán — tích khoản nào thì quỹ trả đủ khoản đó (khoản gốc là khoản cá nhân ứng chi hoặc phần chi vượt tiền ứng).
  const [selecting, setSelecting] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const { payMany } = useFundPay(reload);
  const isHeld = side === 'held';
  const { hidden } = useHiddenPaid();
  /** Trang "Nợ quỹ": đang mở danh sách các lần giao dưới dòng "Tổng giao A ứng". */
  const [lotsOpen, setLotsOpen] = useState(false);

  const balance = useMemo(() => fundPersonBalances(data, fund).find((item) => item.person === person.trim()), [data, fund, person]);
  const detail = useMemo(() => {
    const full = buildPersonFundDetail(data, fund, person);
    return side ? filterPersonDetailBySide(full, side) : full;
  }, [data, fund, person, side]);
  const targets = useMemo(() => fundPersonTargets(data, fund, person).filter((item) => !side || (item.kind === 'payout') === (side === 'owed')), [data, fund, person, side]);
  /** Có khoản thanh toán được ngay (còn khoản quỹ nợ hoặc tiền ứng còn giữ). */
  const canPay = loaded && !error && !isHeld && targets.some((item) => !isFundPayBlocked(item));
  /** Các hồ sơ ứng trước người đó còn giữ tiền (mỗi hồ sơ một khoản hoàn tiền ứng còn lại). */
  const heldAdvances = targets.filter((item) => item.kind === 'refund' && item.advanceId);
  const pickedTargets = targets.filter((item) => item.kind === 'payout' && pickedKeys.has(item.key));
  const pickedTotal = pickedTargets.reduce((sum, item) => sum + item.remaining, 0);
  const fundNames = [...new Set(pickedTargets.map((item) => data.funds.find((entry) => entry.id === item.fundId)?.name ?? 'Quỹ'))];
  const picker = fundNames.length === 1 ? fundNames[0] : 'Quỹ';

  function stopSelecting() {
    setSelecting(false);
    setConfirmOpen(false);
    setPickedKeys(new Set());
  }
  function togglePick(key: string) {
    setPickedKeys((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function pressPickedPay() {
    if (pickedTargets.length === 0) return;
    setConfirmOpen(true);
  }
  /** Ghi từng khoản đã chọn, mỗi khoản trả đủ số còn nợ của chính nó. */
  async function payPicked() {
    if (paying || pickedTargets.length === 0) return;
    setPaying(true);
    try {
      await payMany(pickedTargets.map((target) => ({ target, amount: target.remaining })));
      stopSelecting();
    } catch (e) {
      setConfirmOpen(false);
      toast.show(describeFundError(e));
    } finally {
      setPaying(false);
    }
  }

  /** Hoàn tiền ứng: gộp mọi lần giao của người đó thành một khoản; hoàn một phần thì trừ vào lần giao mới nhất trước. */
  function startRefund() {
    router.push({ pathname: '/quy/ung-chi', params: { mode: 'refund', person: person.trim(), fund } });
  }

  /** Khoá chọn thanh toán của một dòng A ứng chi (khoản cá nhân ứng chi hoặc phần chi vượt tiền được giao). */
  const pickKey = (entry: { kind: string; id: string }) => (entry.kind === 'overflow' ? `payout:a:${entry.id}` : `payout:e:${entry.id}`);
  /** Mở trang chi tiết của một dòng A ứng chi. */
  const openDetail = (entry: { kind: string; id: string }) => router.push({ pathname: '/quy/chi-tiet', params: entry.kind === 'overflow' ? { kind: 'overflow', id: entry.id } : { kind: 'expense', id: entry.id } });

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
              title: 'Chi vượt tiền giao',
              date: spendOver(target)?.date ?? target.date,
              note: (() => {
                const over = spendOver(target);
                return over ? `${over.title} · ${formatVnd(over.amount)}` : undefined;
              })(),
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
    // Ngăn xếp "Đã thanh toán" (trang Quỹ nợ): các khoản quỹ đã trả xong cho người này — khoản cá nhân ứng chi đã trả đủ và phần chi vượt tiền ứng đã trả đủ; mờ, gạch ngang, có thể "Xóa lịch sử" (chỉ ẩn).
    const who = person.trim();
    const allPaidRows =
      side === 'owed'
        ? [
            ...data.expenses
              .filter((e) => e.mode === 'personal' && e.payer?.trim() === who && (fund === 'all' || e.fundId === fund) && personalDebt(data, e).state === 'paid' && personalDebt(data, e).amount > 0)
              .map((e) => ({ key: `fund:e:${e.id}`, title: e.title || 'Chi quỹ', date: e.date, amount: personalDebt(data, e).amount })),
            ...(data.advances ?? [])
              .filter((a) => a.person.trim() === who && (fund === 'all' || a.fundId === fund))
              .map((a) => ({ a, summary: advanceSummary(data, a) }))
              .filter(({ summary }) => summary.paidExtra > 0 && summary.owed === 0)
              .map(({ a, summary }) => ({ key: `fund:a:${a.id}`, title: 'Chi vượt tiền ứng', date: overflowExpense(data, a.fundId, who)?.date ?? a.date, amount: summary.paidExtra })),
          ]
            .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
        : [];
    const hiddenPaidKeys = allPaidRows.filter((row) => hidden.has(row.key)).map((row) => row.key);
    const paidRows = allPaidRows.filter((row) => !hidden.has(row.key));
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
              {items.map((entry, index) => {
                // Khoản A ứng chi (cá nhân ứng chi hoặc chi vượt tiền giao): dòng phẳng trên nền trắng, ngăn cách bằng đường kẻ mảnh; KHÔNG vuốt Sửa / Xóa, chạm dòng chỉ để xem chi tiết.
                // Đang chọn khoản để thanh toán: có ô tích, chạm dòng để tích.
                const spendRow = entry.kind === 'personalSpend' || entry.kind === 'overflow';
                const partial = entry.kind === 'personalSpend' && (remainingOf.get(entry.id) ?? entry.amount) < entry.amount;
                const title = entry.kind === 'overflow' ? 'Chi vượt tiền giao' : entry.title;
                return (
                  <Pressable
                    key={`${entry.kind}:${entry.id}`}
                    disabled={!spendRow}
                    accessibilityRole={spendRow ? 'button' : undefined}
                    accessibilityLabel={spendRow ? `${title}, -${formatVnd(entry.amount)}` : undefined}
                    onPress={() => (selecting ? togglePick(pickKey(entry)) : openDetail(entry))}
                    style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
                  >
                    {spendRow && <CheckSlot active={selecting} gap={10} checked={pickedKeys.has(pickKey(entry))} label={title} onToggle={() => togglePick(pickKey(entry))} />}
                    <View style={styles.flex}>
                      <AppText weight="semibold" style={styles.itemTitle} numberOfLines={2}>
                        {title}
                      </AppText>
                      <AppText color={colors.muted} style={styles.itemSub}>
                        {entry.kind === 'overflow'
                          ? [formatVnDate(entry.date), entry.note].filter(Boolean).join('\n')
                          : isHeld
                            ? (entry.note ?? '')
                            : side === 'owed'
                              ? formatVnDate(entry.date)
                              : `${PERSON_ITEM_LABEL[entry.kind]} · ${formatVnDate(entry.date)}`}
                      </AppText>
                    </View>
                    <View style={styles.itemRight}>
                      <AppText weight="bold" color={spendRow ? colors.danger : entry.kind === 'refund' ? colors.success : entry.kind === 'payout' ? colors.muted : undefined} style={styles.itemAmount}>
                        {spendRow ? '−' : ''}
                        {formatVnd(entry.amount)}
                      </AppText>
                      {/* Khoản đã được quỹ trả một phần: ghi chú nhỏ số CÒN NỢ ngay dưới số tiền (màu cam). */}
                      {partial && (
                        <AppText color={colors.warning} style={styles.itemSub}>
                          Còn nợ {formatVnd(remainingOf.get(entry.id) ?? 0)}
                        </AppText>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </PayPageFrame>
        {(paidRows.length > 0 || hiddenPaidKeys.length > 0) && (
          <PaidStack count={paidRows.length} keys={paidRows.map((row) => row.key)} hiddenKeys={hiddenPaidKeys}>
            {paidRows.map((row, index) => (
              <View key={row.key} style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
                <View style={styles.flex}>
                  <AppText weight="medium" color={colors.muted} style={[styles.itemTitle, styles.paidText]} numberOfLines={2}>
                    {row.title}
                  </AppText>
                  <AppText color={colors.muted} style={styles.itemSub}>
                    {formatVnDate(row.date)} · Đã thanh toán
                  </AppText>
                </View>
                <AppText weight="bold" color={colors.muted} style={[styles.itemAmount, styles.paidText]}>
                  {formatVnd(row.amount)}
                </AppText>
              </View>
            ))}
          </PaidStack>
        )}
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
        right={
          selecting ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn khoản" hitSlop={8} onPress={stopSelecting} style={styles.cancel}>
              <AppText weight="semibold" color={colors.danger} style={styles.cancelText}>
                Hủy
              </AppText>
            </Pressable>
          ) : undefined
        }
      />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay || selecting ? PAY_ACTION_BAR_CLEARANCE : 0) }]}>{body}</KeyboardAwareScrollView>
      <PayActionBar
        visible={canPay || selecting}
        label={selecting ? (pickedTargets.length > 0 ? `Thanh toán ${pickedTargets.length} khoản · ${formatVnd(pickedTotal)}` : 'Chọn khoản cần thanh toán') : undefined}
        disabled={selecting && pickedTargets.length === 0}
        bottom={16}
        onPress={selecting ? pressPickedPay : () => setPayOpen(true)}
      />
      {payOpen && <FundPayFlow data={data} person={person.trim()} scope={fund} side={side} reload={reload} onClose={() => setPayOpen(false)} onSelectItems={side === 'owed' ? () => setSelecting(true) : undefined} />}
      {confirmOpen && pickedTargets.length > 0 && (
        <PaymentConfirmSheet message={`${picker} trả ${person}`} amountText={formatVnd(pickedTotal)} amount={pickedTotal} note={`Thanh toán ${pickedTargets.length} khoản đã chọn`} busy={paying} onCancel={() => setConfirmOpen(false)} onConfirm={() => void payPicked()} />
      )}
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
  cancel: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 16, lineHeight: 22 },
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
  paidText: { textDecorationLine: 'line-through' },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemRight: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 15 },
});
