import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EmptyState, SectionCard, StatusBadge } from '@/components/design';
import { PaymentPanel, type PayChoice } from '@/components/payment-panel';
import { SelectableCard } from '@/components/selectable-card';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { recordDebtPaymentSynced } from '@/data/payService';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { buildDebtDetail } from '@/domain/debtDetail';
import { buildDebtOverview, type DebtPersonRow } from '@/domain/debtOverview';
import type { DebtPayOption } from '@/domain/debtPay';
import { describeDebtError } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Pay } from '@/types/pay';
import { roundVnd } from '@/domain/money';
import { formatVnd } from '@/utils/format';
import { DEBT_ZERO } from '@/domain/ledger';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

interface DataProps {
  bills: readonly Bill[];
  pays: readonly Pay[];
  period: Period;
}

/**
 * Phần 1 — Tổng quan công nợ: hai số tách riêng "Tôi nợ" (tổng tôi phải trả) và "Nợ tôi" (tổng người khác phải trả tôi), tính bằng đúng
 * `buildDebtOverview` (tổng ròng từng người, toàn thời gian). Không bù trừ hai nhóm thành một số.
 */
export function DebtTotalsSection({ bills, pays, period }: DataProps) {
  const colors = useColors();
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  return (
    <SectionCard title="Tổng quan" subtitle="Toàn thời gian">
      <View style={styles.totals}>
        <View style={[styles.total, { backgroundColor: colors.bg, borderColor: colors.line }]} accessible accessibilityLabel={`Tôi nợ ${formatVnd(overview.owe)}`}>
          <AppText weight="medium" color={colors.muted} style={styles.label}>
            Tôi nợ
          </AppText>
          <AppText weight="display" color={overview.owe >= DEBT_ZERO ? colors.danger : colors.ink} style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {formatVnd(overview.owe)}
          </AppText>
        </View>
        <View style={[styles.total, { backgroundColor: colors.bg, borderColor: colors.line }]} accessible accessibilityLabel={`Nợ tôi ${formatVnd(overview.get)}`}>
          <AppText weight="medium" color={colors.muted} style={styles.label}>
            Nợ tôi
          </AppText>
          <AppText weight="display" color={overview.get >= DEBT_ZERO ? colors.success : colors.ink} style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {formatVnd(overview.get)}
          </AppText>
        </View>
      </View>
    </SectionCard>
  );
}

interface PeopleProps extends DataProps {
  /** Chạm một người để mở trang thanh toán với người đó (không lọc lịch sử). */
  onOpen: (name: string) => void;
}

/** Tên các người đang có công nợ (khoá của cơ chế chọn), đúng thứ tự hiển thị. */
export function debtPeopleNames(bills: readonly Bill[], pays: readonly Pay[], period: Period): string[] {
  return buildDebtOverview(bills, pays, period).people.map((person) => person.name);
}

function personCaption(person: DebtPersonRow): string {
  return person.tone === 'owe' ? 'Tôi nợ' : person.tone === 'get' ? 'Nợ tôi' : 'Hai khoản nợ bù nhau';
}

/**
 * Phần 2 — Chi tiết nợ: mỗi người một thẻ, cùng MỘT hàng: bên trái nhãn "Tôi nợ" (đỏ) / "Nợ tôi" (xanh) / "Bù nhau" rồi tên, bên phải tổng vay và bill. Chạm thẻ để chọn / bỏ chọn người đó (lọc lịch sử giao dịch và hiện nút
 * Thanh toán); nút "›" bên phải mở màn chi tiết nợ hiện có.
 */
export function DebtPeopleSection({ bills, pays, period, onOpen }: PeopleProps) {
  const colors = useColors();
  const overview = useMemo(() => buildDebtOverview(bills, pays, period), [bills, pays, period]);
  return (
    <SectionCard title="Chi tiết nợ" subtitle="Toàn thời gian" rightTop={`${overview.people.length} người`}>
      {overview.people.length === 0 ? (
        <EmptyState text="Không còn khoản nợ nào" icon="check" />
      ) : (
        <View style={styles.list}>
          {overview.people.map((person) => {
            const tint = person.tone === 'get' ? colors.success : person.tone === 'owe' ? colors.danger : colors.muted;
            return (
              <SelectableCard key={person.name} selected={false} onPress={() => onOpen(person.name)} accessibilityLabel={`Thanh toán với ${person.name}, ${personCaption(person)} ${formatVnd(Math.abs(person.total))}`}>
                <View style={styles.cardRow}>
                  <StatusBadge label={person.tone === 'owe' ? 'Tôi nợ' : person.tone === 'get' ? 'Nợ tôi' : 'Bù nhau'} tone={person.tone === 'owe' ? 'owe' : person.tone === 'get' ? 'get' : 'info'} style={styles.rowBadge} />
                  <AppText weight="semibold" style={[styles.flex, styles.rowName]} numberOfLines={1}>
                    {person.name}
                  </AppText>
                  <AppText weight="bold" color={tint} style={styles.amount}>
                    {SIGN[person.tone]}
                    {formatVnd(Math.abs(person.total))}
                  </AppText>
                  <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={1.5} />
                </View>
              </SelectableCard>
            );
          })}
        </View>
      )}
    </SectionCard>
  );
}

interface PanelProps extends DataProps {
  name: string;
  onDone: () => void;
  onPaid: (message: string) => Promise<void> | void;
  onFailure: (message: string) => void;
}

/**
 * Tóm tắt thanh toán công nợ với một người (dùng cho tờ nổi và bảng thanh toán): người trả → người nhận, TỔNG còn phải thanh toán (cả nợ vay và nợ bill, nghìn đồng)
 * và `receiving` = người kia nợ tôi (tôi nhận tiền). `null` khi chưa thanh toán được (hai sổ trái dấu: phải gộp nợ trước).
 */
export function debtPaySummary(detail: ReturnType<typeof buildDebtDetail>, name: string): { payer: string; receiver: string; total: number; receiving: boolean } | null {
  if (!detail.canPay) return null;
  const receiving = detail.payActions[0].balance > 0; // hai sổ cùng dấu: dương = họ nợ tôi
  return {
    payer: receiving ? name : BILL_OWNER_NAME,
    receiver: receiving ? BILL_OWNER_NAME : name,
    total: roundVnd(detail.payActions.reduce((sum, action) => sum + Math.abs(action.balance), 0)),
    receiving,
  };
}

/**
 * Bảng thanh toán công nợ với MỘT người (trong tờ nổi của trang Thanh toán công nợ): dùng lại `PaymentPanel` với HAI nút — Thanh toán toàn bộ (trả hết nợ bill và nợ vay
 * còn lại) và Thanh toán một phần (trả nợ bill trước, rồi nợ vay; phần dư ghi thành nợ vay mới). Ghi bằng `recordDebtPaymentSynced` → `planDebtPayment`
 * (quy tắc phân bổ và xử lý tiền dư giữ nguyên; hai sổ trái dấu thì không có Thanh toán, phải gộp nợ trước).
 */
export function DebtPaymentPanel({ name, bills, pays, period, onDone, onPaid, onFailure }: PanelProps) {
  const detail = useMemo(() => buildDebtDetail(bills, pays, name, period), [bills, pays, name, period]);
  const summary = debtPaySummary(detail, name);
  if (!summary) return null;
  const choices: PayChoice[] = [
    { id: 'all', label: 'Thanh toán toàn bộ', amount: summary.total },
    { id: 'partial', label: 'Thanh toán một phần', max: null, placeholder: 'Nhập số tiền' },
  ];
  return (
    <PaymentPanel
      remaining={summary.total}
      choices={choices}
      payer={summary.payer}
      receiver={summary.receiver}
      onPay={async (amount, id) => {
        const option = id as DebtPayOption;
        const result = await recordDebtPaymentSynced(name, option, option === 'partial' ? amount : undefined);
        await onPaid(result.value.message);
      }}
      onDone={onDone}
      onFailure={(e) => onFailure(describeDebtError(e))}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  totals: { flexDirection: 'row', gap: 12 },
  total: { flex: 1, minWidth: 0, borderRadius: AppRadius.card, borderWidth: 1, padding: 14, gap: 2 },
  label: { fontSize: 12.5, lineHeight: 17 },
  value: { fontSize: 22, lineHeight: 30, letterSpacing: -0.3 },
  list: { gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Giống danh sách Thanh toán bill ở Chia bill: cùng khoảng cách, nhãn căn giữa dọc, tên cùng chiều cao dòng với số tiền. */
  rowBadge: { alignSelf: 'center', marginTop: 0 },
  rowName: { fontSize: 15.5, lineHeight: 23 },
  name: { fontSize: 15.5, lineHeight: 21 },
  note: { fontSize: 12.5, lineHeight: 17 },
  amount: { fontSize: 17, lineHeight: 23 },
});
