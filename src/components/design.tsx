import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { ModalPresence } from '@/components/modal-presence';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import { formatNote } from '@/utils/note';

/**
 * Bộ thành phần giao diện dùng chung (phong cách Minimal Finance): tiêu đề khu vực, thẻ số liệu (chỉ xem), ô lối vào (bấm để
 * mở), dòng "tên – số tiền", trạng thái trống, nút chính / phụ và hộp thoại xác nhận. Màu lấy từ \`useColors()\`:
 * navy chủ đạo, xanh lá = tiền nhận, đỏ = tiền phải trả, xám = thông tin phụ.
 */

export type AmountTone = 'get' | 'owe' | 'mid';

/** Màu số tiền theo quy ước toàn app: nhận = xanh lá, trả = đỏ, còn lại trung tính. */
export function useToneColor() {
  const colors = useColors();
  return (tone: AmountTone | undefined) => (tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : colors.ink);
}

// ───────────────────────── Tiêu đề màn hình gốc ─────────────────────────

/** Tiêu đề lớn của một trang gốc (tab), kèm khoảng đệm theo vùng an toàn phía trên. */
export function ScreenTitle({ title, topInset = 0, right, afterTitle }: { title: string; topInset?: number; right?: ReactNode; afterTitle?: ReactNode }) {
  return (
    <View style={[styles.screenTitleWrap, { paddingTop: PageLayout.titleTop + topInset }]}>
      <View style={styles.screenTitleRow}>
        <View style={styles.screenTitleLeft}>
          <AppText weight="display" style={[styles.screenTitle, { flexShrink: 0 }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
          {afterTitle}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Tiêu đề của modal / tờ nổi (bottom sheet): tên thao tác bên trái, nút đóng bên phải. Nhỏ hơn `ScreenTitle` để phân cấp rõ với tiêu đề màn hình. */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.modalHeader}>
      <AppText weight="bold" style={styles.modalTitle} accessibilityRole="header" numberOfLines={2}>
        {title}
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={10} onPress={onClose} style={[styles.modalClose, { backgroundColor: colors.surface2 }]}>
        <SvgIcon name="close" size={16} color={colors.muted} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

/**
 * Nút thao tác chính ở bên phải hàng tiêu đề của các tab chức năng ("+ Chi tiêu", "+ Tạo bill", "+ Giao dịch", "+ Giao dịch quỹ"):
 * nền navy, chữ trắng, biểu tượng dấu +. Dùng cùng `ScreenTitle` (tham số `right`) để mọi tab có cùng kích thước và vị trí.
 */
export function TitleAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`+ ${label}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.titleAction, { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 }]}
    >
      <SvgIcon name="plus" size={16} color={colors.primaryInk} strokeWidth={2.4} />
      <AppText weight="semibold" color={colors.primaryInk} style={styles.titleActionText} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

// ───────────────────────── Tiêu đề khu vực ─────────────────────────

interface SectionHeaderProps {
  title: string;
  /** Dòng phụ nhỏ bên dưới tiêu đề (ví dụ tên kỳ đang xem). */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <AppText weight="bold" style={styles.sectionTitle}>
          {title}
        </AppText>
        {!!subtitle && (
          <AppText color={colors.muted} style={styles.caption}>
            {subtitle}
          </AppText>
        )}
      </View>
      {!!actionLabel && !!onAction && (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction}>
          <AppText weight="semibold" color={colors.accent} style={styles.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

interface CardHeadProps extends SectionHeaderProps {
  /** Bên phải, sát mép khung: dòng trên (ví dụ "7 khoản chi") và dòng dưới (ví dụ số tiền). */
  rightTop?: string;
  rightBottom?: ReactNode;
  /** Thay dòng phụ bên trái bằng một phần tử tuỳ ý (ví dụ ghi chú kỳ bấm được `PeriodNote`); có thì bỏ qua `subtitle`. */
  subtitleNode?: ReactNode;
  /** true: dòng phụ bên trái và dòng dưới bên phải luôn trên MỘT dòng, hết chỗ thì thu nhỏ chữ thay vì cắt bằng "…". */
  fit?: boolean;
}

/**
 * Đầu thẻ dùng chung cho mọi thẻ ở tab Chi tiêu, Chia bill, Công nợ: tiêu đề (cùng cỡ chữ) và bên dưới là thời gian đang xem; bên phải sát mép
 * là thông tin tóm tắt (dòng trên số lượng, dòng dưới số tiền). Không có đệm riêng: thẻ chứa nó tự đặt lề.
 */
export function CardHead({ title, subtitle, subtitleNode, actionLabel, onAction, rightTop, rightBottom, fit }: CardHeadProps) {
  const fitProps = fit ? ({ adjustsFontSizeToFit: true, minimumFontScale: 0.7 } as const) : {};
  const colors = useColors();
  return (
    <View style={styles.sectionHead}>
      <View style={styles.flex}>
        <AppText weight="bold" style={styles.cardHeadTitle} numberOfLines={1}>
          {title}
        </AppText>
        {subtitleNode ?? (!!subtitle && (
          <AppText color={colors.muted} style={styles.caption} numberOfLines={1} {...fitProps}>
            {subtitle}
          </AppText>
        ))}
      </View>
      {(!!rightTop || !!rightBottom) && (
        <View style={styles.cardHeadRight}>
          {!!rightTop && (
            <AppText weight="semibold" color={colors.muted} style={styles.cardHeadTop} numberOfLines={1}>
              {rightTop}
            </AppText>
          )}
          {!!rightBottom &&
            (typeof rightBottom === 'string' ? (
              <AppText color={colors.muted} style={styles.caption} numberOfLines={1} {...fitProps}>
                {rightBottom}
              </AppText>
            ) : (
              rightBottom
            ))}
        </View>
      )}
      {!!actionLabel && !!onAction && (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction}>
          <AppText weight="semibold" color={colors.accent} style={styles.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

interface SectionCardProps extends CardHeadProps {
  children: ReactNode;
}

/** Thẻ có đầu thẻ (`CardHead`) NẰM TRONG khung, rồi tới nội dung: nền thẻ, bo góc, không viền, đệm 16. */
export function SectionCard({ children, ...head }: SectionCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <CardHead {...head} />
      {children}
    </View>
  );
}

interface HeroCardProps {
  label: string;
  amount: string;
  caption?: string;
}

/** Thẻ tổng nền đậm của màn Chi tiết nợ: nhãn nhỏ, số tiền lớn, dòng chú thích. Dùng chung cho Chi tiết nợ và các trang Thanh toán. */
export function HeroCard({ label, amount, caption }: HeroCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
      <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
        {label}
      </AppText>
      <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
        {amount}
      </AppText>
      {!!caption && (
        <AppText color={colors.heroSoft} style={styles.heroCaption}>
          {caption}
        </AppText>
      )}
    </View>
  );
}

// ───────────────────────── Thẻ số liệu (chỉ xem) ─────────────────────────

/** Màu biểu tượng nhận diện nhóm chức năng (token `icon*`). */
export type TileTint = 'blue' | 'purple' | 'teal' | 'orange';

function useTint(tint: TileTint): string {
  const colors = useColors();
  return { blue: colors.iconBlue, purple: colors.iconPurple, teal: colors.iconTeal, orange: colors.iconOrange }[tint];
}

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: AmountTone;
  caption?: string;
  /** Biểu tượng nhỏ cạnh nhãn (tuỳ chọn) và màu của nó. */
  icon?: IconName;
  tint?: TileTint;
  style?: StyleProp<ViewStyle>;
}

/** Thẻ tổng hợp số liệu, KHÔNG bấm được: nền trắng, viền mảnh, không mũi tên. */
export function SummaryCard({ label, value, tone, caption, icon, tint = 'blue', style }: SummaryCardProps) {
  const colors = useColors();
  const toneColor = useToneColor();
  const tintColor = useTint(tint);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.cardHead}>
        {icon && <SvgIcon name={icon} size={18} color={tintColor} strokeWidth={2} />}
        <AppText weight="medium" color={colors.muted} style={styles.cardLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText weight="bold" color={toneColor(tone)} style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {!!caption && (
        <AppText color={colors.muted} style={styles.caption} numberOfLines={2}>
          {caption}
        </AppText>
      )}
    </View>
  );
}

// ───────────────────────── Ô lối vào (bấm để mở) ─────────────────────────

interface NavTileProps {
  icon: IconName;
  tint?: TileTint;
  label: string;
  caption?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Lối vào một chức năng: biểu tượng màu cạnh tên (cùng dáng với thẻ số liệu), mũi tên bên phải (khác thẻ số liệu chỉ xem). */
export function NavTile({ icon, tint = 'teal', label, caption, onPress, style }: NavTileProps) {
  const colors = useColors();
  const tintColor = useTint(tint);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.tile, { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.85 : 1 }, style]}
    >
      <View style={styles.tileTop}>
        <View style={styles.cardHead}>
          <SvgIcon name={icon} size={18} color={tintColor} strokeWidth={2} />
          <AppText weight="medium" color={colors.muted} style={styles.cardLabel} numberOfLines={1}>
            {label}
          </AppText>
        </View>
        <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
      </View>
      <View>
        {!!caption && (
          <AppText color={colors.muted} style={styles.caption} numberOfLines={2}>
            {caption}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

// ───────────────────────── Khung nhóm dòng ─────────────────────────

/** Khung trắng bo vừa phải, viền mảnh, chứa một nhóm dòng. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>{children}</View>;
}

// ───────────────────────── Dòng tên – số tiền ─────────────────────────

interface PersonAmountRowProps {
  name: string;
  amount: string;
  tone?: AmountTone;
  /** Dòng phụ nhỏ dưới tên. */
  caption?: string;
  onPress?: () => void;
  /** Dòng đầu không có đường phân cách phía trên. */
  first?: boolean;
  accessibilityLabel?: string;
}

/** Tên bên trái, số tiền căn phải thẳng hàng; có mũi tên khi bấm được. Phân cách bằng đường mảnh. */
export function PersonAmountRow({ name, amount, tone, caption, onPress, first, accessibilityLabel }: PersonAmountRowProps) {
  const colors = useColors();
  const toneColor = useToneColor();
  const content = (
    <>
      <View style={styles.flex}>
        <AppText weight="semibold" style={styles.rowName} numberOfLines={1}>
          {name}
        </AppText>
        {!!caption && (
          <AppText color={colors.muted} style={styles.caption} numberOfLines={2}>
            {caption}
          </AppText>
        )}
      </View>
      <AppText weight="bold" color={toneColor(tone)} style={styles.rowAmount}>
        {amount}
      </AppText>
      {onPress && <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />}
    </>
  );
  const rowStyle = [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.7 : 1 }]}>
      {content}
    </Pressable>
  );
}

// ───────────────────────── Dòng giao dịch ─────────────────────────

interface TransactionRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Số tiền đã định dạng (kèm dấu nếu cần) căn phải. */
  amount: string;
  tone?: AmountTone;
  /** Nhãn nhỏ dưới số tiền (ví dụ ngày hoặc loại giao dịch). */
  meta?: string;
  /** Nhãn dạng viên thuốc dưới dòng phụ (ví dụ "Liên kết bill", trạng thái thanh toán) và màu của nó. */
  badge?: string;
  badgeTone?: StatusTone;
  /** Nhãn trạng thái cỡ nhỏ hơn (nhãn dài). */
  smallBadge?: boolean;
  first?: boolean;
  /** true: tiêu đề chỉ một dòng, dài quá thì cắt bằng "…" (mặc định tối đa 2 dòng). */
  singleLineTitle?: boolean;
  /** true: dòng phụ chỉ một hàng, dài quá thì cắt bằng "…" (mặc định tối đa 4 dòng). */
  singleLineSubtitle?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Không vẽ đường phân cách và đệm ngang (khi đặt trong `SwipeRow` đã có khung riêng). */
  bare?: boolean;
}

/** Màu của nhãn trạng thái: get = xanh lá (đã xong / nhận), owe = đỏ (chưa / còn thiếu), warn = vàng cam (một phần), info = navy nhạt. */
export type StatusTone = 'get' | 'owe' | 'warn' | 'info';

/** Nhãn trạng thái nhỏ dạng viên thuốc, dùng chung (danh sách bill, chi tiết bill, nhãn liên kết). Chỉ nhãn đổi màu, không đổi cả thẻ. */
export function StatusBadge({ label, tone = 'info', style, small = false }: { label: string; tone?: StatusTone; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const colors = useColors();
  const palette = {
    get: { bg: colors.successSoft, fg: colors.success },
    owe: { bg: colors.dangerSoft, fg: colors.danger },
    warn: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.primarySoft, fg: colors.primary },
  }[tone];
  return (
    <View style={[styles.badge, small && styles.badgeSmall, { backgroundColor: palette.bg }, style]}>
      <AppText weight="semibold" color={palette.fg} style={[styles.badgeText, small && styles.badgeTextSmall]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Dòng giao dịch: biểu tượng, nội dung + thông tin phụ bên trái, số tiền căn phải kèm nhãn nhỏ. */
export function TransactionRow({ icon, title, subtitle, amount, tone, meta, badge, badgeTone, smallBadge, first, singleLineTitle, singleLineSubtitle, onPress, accessibilityLabel, bare }: TransactionRowProps) {
  const colors = useColors();
  const toneColor = useToneColor();
  const content = (
    <>
      {icon}
      <View style={styles.flex}>
        <AppText weight="semibold" style={styles.txTitle} numberOfLines={singleLineTitle ? 1 : 2} ellipsizeMode="tail">
          {title}
        </AppText>
        {!!subtitle && (
          <AppText color={colors.muted} style={styles.caption} numberOfLines={singleLineSubtitle ? 1 : 4} ellipsizeMode="tail">
            {formatNote(subtitle)}
          </AppText>
        )}
      </View>
      <View style={styles.txRight}>
        <AppText weight="bold" color={toneColor(tone)} style={styles.rowAmount}>
          {amount}
        </AppText>
        {!!badge && (
          <View style={styles.txBadge}>
            <StatusBadge label={badge} tone={badgeTone} small={smallBadge} />
          </View>
        )}
        {!!meta && (
          <AppText color={colors.muted} style={styles.caption} numberOfLines={1}>
            {meta}
          </AppText>
        )}
      </View>
    </>
  );
  const rowStyle = [styles.txRow, !bare && !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.7 : 1 }]}>
      {content}
    </Pressable>
  );
}

// ───────────────────────── Thanh chuyển mục và hàng chip lọc ─────────────────────────

/** Thanh chuyển giữa các mục (vài lựa chọn ngang nhau): mục đang chọn nền navy chữ trắng, các mục còn lại chìm trên nền xám. */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface2 }]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segmentedItem, selected && { backgroundColor: colors.primary }]}
          >
            <AppText weight="semibold" color={selected ? colors.primaryInk : colors.muted} style={styles.segmentedText} numberOfLines={1} adjustsFontSizeToFit>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Một hàng nút lọc cuộn ngang (không xuống dòng); nút đang chọn nền navy. Dùng cho danh mục và loại giao dịch. */
export function ChipRow<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipContent} keyboardShouldPersistTaps="handled">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <AppText weight="medium" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ───────────────────────── Trạng thái trống ─────────────────────────

export function EmptyState({ text, icon, action }: { text: string; icon?: IconName; action?: { label: string; onPress: () => void } }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      {icon && <SvgIcon name={icon} size={28} color={colors.muted} strokeWidth={1.6} />}
      <AppText color={colors.muted} style={styles.emptyText}>
        {text}
      </AppText>
      {action && <SecondaryButton label={action.label} onPress={action.onPress} style={styles.emptyAction} />}
    </View>
  );
}

// ───────────────────────── Nút ─────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Biểu tượng đặt bên trái nhãn (tuỳ chọn, chỉ nút phụ). */
  icon?: ReactNode;
}

/** Nút hành động chính: nền navy, chữ trắng. */
export function PrimaryButton({ label, onPress, disabled, style }: ButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 }, style]}
    >
      <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Nút phụ: nền nhạt, chữ navy; không tranh chú ý với nút chính. */
export function SecondaryButton({ label, onPress, disabled, style, icon }: ButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, !!icon && styles.buttonWithIcon, { backgroundColor: colors.primarySoft, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}
    >
      {icon}
      <AppText weight="semibold" color={colors.primary} style={styles.buttonText}>
        {label}
      </AppText>
    </Pressable>
  );
}

// ───────────────────────── Hộp thoại xác nhận ─────────────────────────

interface ConfirmDialogProps {
  title: string;
  /** Dòng mô tả (ví dụ "Tôi trả An"). */
  message?: string;
  /** Số tiền hiển thị lớn (đã định dạng). */
  amountText?: string;
  note?: string;
  /** Cảnh báo nổi bật (nền đỏ nhạt, chữ đỏ) đặt ngay dưới tiêu đề. */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Xác nhận một thao tác quan trọng (thanh toán, xoá…). Hiện đè lên toàn màn hình, nền mờ. */
export function ConfirmDialog({ title, message, amountText, note, warning, confirmLabel = 'Xác nhận', cancelLabel = 'Huỷ', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const colors = useColors();
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={() => {
        if (!busy) onCancel();
      }}>
      <ModalPresence />
      <KeyboardAvoid style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <AppText weight="bold" style={styles.dialogTitle}>
            {title}
          </AppText>
          {!!warning && (
            <View style={[styles.dialogWarning, { backgroundColor: colors.dangerSoft }]} accessibilityRole="alert">
              <AppText weight="semibold" color={colors.danger} style={styles.dialogWarningText}>
                {warning}
              </AppText>
            </View>
          )}
          {!!message && <AppText style={styles.dialogMessage}>{message}</AppText>}
          {!!amountText && (
            <AppText weight="display" style={styles.dialogAmount}>
              {amountText}
            </AppText>
          )}
          {!!note && (
            <AppText color={colors.muted} style={styles.caption}>
              {note}
            </AppText>
          )}
          <View style={styles.dialogButtons}>
            <SecondaryButton label={cancelLabel} disabled={busy} onPress={onCancel} style={styles.flex} />
            <PrimaryButton label={confirmLabel} disabled={busy} onPress={onConfirm} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screenTitleWrap: { paddingHorizontal: PageLayout.paddingX, paddingBottom: PageLayout.titleBottom },
  /** Hàng cao cố định (bằng nút "+"), nên tiêu đề không nhảy dù tab có hay chưa có nút thao tác. */
  /** Tiêu đề và nút đặt ngay sau tiêu đề (nếu có), nằm sát nhau bên trái. */
  screenTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  screenTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: PageLayout.titleRowHeight },
  screenTitle: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { flex: 1, fontSize: 18, lineHeight: 26 },
  modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleAction: { height: 40, borderRadius: AppRadius.pill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleActionText: { fontSize: 14, flexShrink: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4, marginBottom: 8 },
  sectionTitle: { fontSize: 17, lineHeight: 24 },
  hero: { borderRadius: 22, padding: 20, gap: 4 },
  heroLabel: { fontSize: 12.5 },
  heroAmount: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  heroCaption: { fontSize: 13 },
  sectionCard: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeadTitle: { fontSize: 18, lineHeight: 24 },
  cardHeadRight: { alignItems: 'flex-end', flexShrink: 0 },
  cardHeadTop: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  action: { fontSize: 13.5 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  cardLabel: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  cardValue: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  tile: { gap: 6 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  panel: { borderRadius: AppRadius.card, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowName: { fontSize: 15.5, lineHeight: 21 },
  rowAmount: { fontSize: 16, lineHeight: 22, textAlign: 'right' },
  badge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: AppRadius.pill },
  badgeText: { fontSize: 11, lineHeight: 15, textAlign: 'right' },
  /** Nhãn nhỏ hơn cho nhãn dài (ví dụ "Thanh toán một phần"). */
  badgeSmall: { paddingHorizontal: 6 },
  badgeTextSmall: { fontSize: 9.5, lineHeight: 13 },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: AppRadius.pill, gap: 4 },
  segmentedItem: { flex: 1, height: 38, borderRadius: AppRadius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentedText: { fontSize: 14 },
  chipScroll: { flexGrow: 0 },
  chipContent: { gap: 8, paddingHorizontal: 16 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: AppRadius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13 },
  txRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  txTitle: { fontSize: 15, lineHeight: 20 },
  txRight: { alignItems: 'flex-end', maxWidth: '52%', flexShrink: 0 },
  /** Nhãn trạng thái nằm ngay dưới số tiền, căn phải. */
  txBadge: { alignSelf: 'flex-end' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 16 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyAction: { alignSelf: 'stretch', marginTop: 8 },
  button: { minHeight: 50, borderRadius: AppRadius.field, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 15.5 },
  buttonWithIcon: { flexDirection: 'row', gap: 8 },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, gap: 8 },
  dialogTitle: { fontSize: 18, lineHeight: 24 },
  dialogMessage: { fontSize: 15.5 },
  dialogWarning: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  dialogWarningText: { fontSize: 14, lineHeight: 20 },
  dialogAmount: { fontSize: 30, lineHeight: 36 },
  dialogButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
