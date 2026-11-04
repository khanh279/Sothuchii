import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { AppRadius } from '@/constants/palette';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';

interface GuideSection {
  icon: IconName;
  title: string;
  points: string[];
}

const INTRO = 'Sổ Thu Chi giúp bạn ghi chi tiêu hằng ngày, chia bill với bạn bè, theo dõi nợ và quản lý quỹ nhóm. Dữ liệu được lưu ngay trên máy của bạn.';

const SECTIONS: GuideSection[] = [
  {
    icon: 'plus',
    title: 'Thêm nhanh bằng nút +',
    points: [
      'Bấm hoặc giữ nút + ở giữa thanh dưới để mở menu hình quạt: Chi tiêu, Tạo bill, Chi quỹ.',
      'Giữ nút rồi vuốt tới ô muốn chọn và thả tay; thả ở nút máy ảnh ở giữa để chụp nhanh một hóa đơn.',
    ],
  },
  {
    icon: 'tabOverview',
    title: 'Tổng quan',
    points: ['Xem tổng chi tiêu theo kỳ, số khoản chi, tình hình nợ, bill, quỹ và các giao dịch gần đây.', 'Bấm bánh răng ở góc trên để vào Thiết lập.'],
  },
  {
    icon: 'wallet',
    title: 'Chi tiêu',
    points: ['Ghi từng khoản chi: số tiền, mục chi, ngày, ghi chú và ảnh hóa đơn đính kèm.', 'Xem chi tiêu theo ngày, theo tháng; vuốt một khoản để sửa hoặc xóa.', 'Đặt ngân sách và hạn mức theo mục trong Thiết lập để theo dõi mức chi so với hạn mức.'],
  },
  {
    icon: 'people',
    title: 'Nợ & Bill',
    points: [
      'Công nợ: ghi ai nợ bạn, bạn nợ ai; thanh toán một phần, hoặc chọn nhiều khoản để thanh toán cùng lúc.',
      'Chia bill: tạo bill, chọn người tham gia và chia tiền; có thể gửi link chỉ xem để mọi người kiểm tra.',
      'Nhắc nợ kèm mã QR nhận tiền; các khoản đã thanh toán xếp mờ bên dưới và có thể hoàn tác.',
    ],
  },
  {
    icon: 'receipt',
    title: 'Quỹ nhóm',
    points: [
      'Tạo quỹ cho nhóm, ghi thu quỹ khi mọi người đóng tiền.',
      'Chi quỹ có ba hình thức: quỹ chi trực tiếp, cá nhân ứng chi (quỹ trả lại sau), giao cá nhân chi (quỹ giao tiền trước).',
      'Số dư quỹ là tiền thu trừ tiền đã chi, có thể xuống 0 hoặc âm; công nợ quỹ cho biết ai còn nợ quỹ, quỹ còn nợ ai.',
    ],
  },
  {
    icon: 'download',
    title: 'Thiết lập và dữ liệu',
    points: [
      'Thiết lập gồm ngân sách tháng, hạn mức theo mục, danh sách người, mục chi riêng, chi định kỳ và tài khoản nhận tiền.',
      'Dữ liệu chỉ lưu trên thiết bị này, không có tài khoản đăng nhập. Hãy dùng Sao lưu và khôi phục để lưu bản dự phòng, nhất là trước khi gỡ app hoặc đổi máy.',
    ],
  },
];

/** Trang "Giới thiệu về ứng dụng" (mở từ danh sách Thiết lập): hướng dẫn sử dụng tổng quát theo từng khu vực của app. */
export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref: scrollRef, props: scrollProps } = useChromeScroll(false);
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Giới thiệu về ứng dụng" topInset={insets.top} />
      <KeyboardAwareScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 8 }]}>
          <AppText weight="display" style={styles.cardTitle}>
            Sổ Thu Chi
          </AppText>
          <AppText color={colors.muted} style={styles.body}>
            {INTRO}
          </AppText>
        </View>
        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.head}>
              <SvgIcon name={section.icon} size={22} color={colors.primary} />
              <AppText weight="display" style={styles.cardTitle}>
                {section.title}
              </AppText>
            </View>
            {section.points.map((point) => (
              <View key={point} style={styles.point}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <AppText style={styles.pointText}>{point}</AppText>
              </View>
            ))}
          </View>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, gap: 6 },
  card: { borderRadius: AppRadius.hero, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 18, lineHeight: 26 },
  body: { fontSize: 14.5, lineHeight: 21 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  pointText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
});
