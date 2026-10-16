import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { TransactionRow } from '@/components/design';
import { SwipeRow } from '@/components/swipe-row';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/utils/color';

/** Đệm ngang trong của dòng lịch sử (`TransactionRow bare` không có đệm ngang, nên thẻ tự đệm). */
const CARD_PADDING_X = 12;

/** Các thuộc tính điều khiển vuốt / chạm — lấy nguyên kiểu từ `SwipeRow` (kiểu props của nó không được export). */
type SwipeProps = Pick<ComponentProps<typeof SwipeRow>, 'open' | 'onOpen' | 'onClose' | 'onEdit' | 'onDelete' | 'onPressRow' | 'locked' | 'onPressLocked' | 'accessibilityLabel'>;

/** Các thuộc tính hiển thị — lấy nguyên kiểu từ `TransactionRow` (kiểu props của nó không được export). */
type RowProps = Pick<ComponentProps<typeof TransactionRow>, 'icon' | 'title' | 'subtitle' | 'amount' | 'tone' | 'meta' | 'badge' | 'badgeTone'>;

export type HistoryCardProps = SwipeProps &
  RowProps & {
    /** Nội dung phụ tuỳ chọn dưới dòng chính (khi một loại lịch sử có phần thêm); không có thì không hiện gì. */
    children?: ReactNode;
  };

/**
 * Thẻ một dòng lịch sử dùng chung: `SwipeRow` (vuốt Sửa / Xoá, khoá dòng) bọc `TransactionRow` (biểu tượng, tiêu đề, dòng phụ, nhãn trạng thái,
 * số tiền căn phải) với đệm ngang 12, nền và bo góc thống nhất.
 *
 * CHỈ trình bày và chuyển tiếp: không tính tiền, không thêm dấu, không đổi đơn vị, không quyết định trạng thái — màn hình truyền vào chuỗi
 * `amount` đã định dạng, `tone` / `badgeTone` đã chọn và các hàm xử lý (`onPressRow`, `onEdit`, `onDelete`, `onPressLocked`…). Việc quản lý
 * dòng nào đang mở (`open`, `onOpen`, `onClose`) vẫn do màn hình (vd. `useSingleOpenRow`) đảm nhiệm; có thể truyền thẳng `{...rowProps(id)}`.
 */
export function HistoryCard({ open, onOpen, onClose, onEdit, onDelete, onPressRow, locked, onPressLocked, accessibilityLabel, children, ...row }: HistoryCardProps) {
  const colors = useColors();
  return (
    <SwipeRow
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={onDelete}
      onPressRow={onPressRow}
      locked={locked}
      onPressLocked={onPressLocked}
      background={colors.bg}
      radius={AppRadius.field}
      accessibilityLabel={accessibilityLabel}>
      <View style={styles.content}>
        <TransactionRow bare {...row} />
        {children}
      </View>
    </SwipeRow>
  );
}

interface IconTileProps {
  /** Màu gốc (mã `#RRGGBB`, lấy từ token màu như `colors.success`): nền là màu này ở độ mờ `alpha`. */
  color: string;
  /** Độ mờ của nền, mặc định 0.16. */
  alpha?: number;
  /** Cạnh của ô vuông, mặc định 40 (bo góc cố định 12). */
  size?: number;
  /** Nội dung biểu tượng (SvgIcon, chữ +/−…), do màn hình tự chọn màu nét. */
  children: ReactNode;
}

/** Ô biểu tượng vuông bo 12 nền màu mờ, dùng cho dòng chuyển tiền hoặc dấu +/− (không thay `CategoryIcon` của chi tiêu và bill). */
export function IconTile({ color, alpha = 0.16, size = 40, children }: IconTileProps) {
  return <View style={[styles.tile, { width: size, height: size, backgroundColor: withAlpha(color, alpha) }]}>{children}</View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: CARD_PADDING_X },
  tile: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
