import { CategoryIcon } from '@/components/category-icon';
import { HistoryCard } from '@/components/history-card';
import { resolveCategory } from '@/domain/expenses';
import { linkedExpenseNotice } from '@/domain/linkedExpense';
import type { ExpenseSettings, ExpenseWithId } from '@/types/expense';
import { formatVnd } from '@/utils/format';

interface RowProps {
  item: ExpenseWithId;
  settings: ExpenseSettings;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPressRow: () => void;
  onPressLocked: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Nhãn liên kết hiện dưới dòng phụ (ví dụ "Liên kết bill"). */
  badge?: string;
  /** Mở khoá dòng dù khoản chi tự sinh: dùng khi Sửa / Xoá được chuyển sang nguồn của nó (ví dụ bill). */
  unlocked?: boolean;
}

/** Một dòng khoản chi cá nhân (vuốt sang trái để Sửa / Xoá; khoản tự sinh từ bill / quỹ bị khoá, chạm hiện lời giải thích). */
export function ExpenseRow({ item, settings, open, onOpen, onClose, onPressRow, onPressLocked, onEdit, onDelete, badge, unlocked }: RowProps) {
  const category = resolveCategory(settings, item.c);
  return (
    <HistoryCard
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={onDelete}
      onPressRow={onPressRow}
      locked={!unlocked && !!linkedExpenseNotice(item)}
      onPressLocked={onPressLocked}
      accessibilityLabel={`${item.n || category.name}, ${formatVnd(item.a)}`}
      icon={<CategoryIcon category={category} />}
      title={item.n || category.name}
      subtitle={item.i || category.name}
      badge={badge}
      amount={`−${formatVnd(item.a)}`}
      tone="owe"
    />
  );
}
