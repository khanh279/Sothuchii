import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { getPhotoUri, putPhoto } from '@/data/photoStore';
import { MAX_PHOTOS, newPhotoId } from '@/domain/photos';
import { pickPhotos, type PhotoSource } from '@/features/photos/pickPhoto';
import { useColors } from '@/hooks/use-colors';
import { tr } from '@/i18n/language';

/** Khoảng cách giữa các ô ảnh. */
const GAP = 8;

/** Địa chỉ hiển thị của một ảnh trong kho (null khi chưa đọc xong hoặc ảnh không còn). */
function usePhotoUri(id: string): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getPhotoUri(id).then((value) => {
      if (alive) setUri(value);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return uri;
}

/**
 * Một ô ảnh vuông. Ô nào cũng chiếm đúng 1/`MAX_PHOTOS` bề rộng khung (có chừa khoảng cách) nên bốn ô luôn vừa khít một hàng và cố định kích thước dù có bao nhiêu ảnh.
 */
function Thumb({ id, onPress, onRemove }: { id: string; onPress: () => void; onRemove?: () => void }) {
  const colors = useColors();
  const uri = usePhotoUri(id);
  return (
    <View style={styles.cell}>
      <Pressable accessibilityRole="button" accessibilityLabel="Xem ảnh" onPress={onPress} style={[styles.fill, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
        {uri ? <Image source={{ uri }} style={styles.image} contentFit="cover" /> : <SvgIcon name="receipt" size={22} color={colors.muted} />}
      </Pressable>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel="Bỏ ảnh này" hitSlop={6} onPress={onRemove} style={[styles.remove, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <SvgIcon name="close" size={12} color={colors.ink} strokeWidth={2.6} />
        </Pressable>
      )}
    </View>
  );
}

/** Ô trống giữ chỗ (cùng kích thước ô ảnh) để hàng ảnh luôn đủ `MAX_PHOTOS` ô; chạm vào ô trống đầu tiên cũng thêm ảnh khi có `onPress`. */
function Slot({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? 'Thêm ảnh vào ô trống' : undefined}
        disabled={!onPress || disabled}
        onPress={onPress}
        style={[styles.fill, styles.empty, { borderColor: colors.line }]}>
        {onPress && <SvgIcon name="plus" size={20} color={colors.muted} strokeWidth={2} />}
      </Pressable>
    </View>
  );
}

/** Một trang ảnh trong bộ xem: ảnh vừa khung, chạm để đóng. */
function ViewerPage({ id, width, onClose }: { id: string; width: number; onClose: () => void }) {
  const uri = usePhotoUri(id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Đóng ảnh" onPress={onClose} style={[styles.page, { width }]}>
      {uri && <Image source={{ uri }} style={styles.viewerImage} contentFit="contain" />}
    </Pressable>
  );
}

/**
 * Xem ảnh toàn màn hình: VUỐT NGANG để chuyển qua lại giữa các ảnh của bản ghi (có số thứ tự "2/4"; trên web có thêm hai nút mũi tên vì không vuốt bằng chuột được); chạm ảnh hoặc nút đóng để thoát.
 * Mở ở ảnh đã chạm (`start`).
 */
function Viewer({ ids, start, onClose }: { ids: readonly string[]; start: number; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(start);
  const go = (next: number) => {
    const target = Math.min(Math.max(next, 0), ids.length - 1);
    setIndex(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: start * width, y: 0 }}
          onLayout={() => scroller.current?.scrollTo({ x: start * width, animated: false })}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}>
          {ids.map((id) => (
            <ViewerPage key={id} id={id} width={width} onClose={onClose} />
          ))}
        </ScrollView>
        {ids.length > 1 && (
          <>
            <View style={styles.pageCount} pointerEvents="none">
              <AppText weight="semibold" color="#FFFFFF" style={styles.pageCountText}>
                {index + 1}/{ids.length}
              </AppText>
            </View>
            {Platform.OS === 'web' && index > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Ảnh trước" onPress={() => go(index - 1)} style={[styles.arrow, { left: 12 }]}>
                <SvgIcon name="chevronLeft" size={22} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            )}
            {Platform.OS === 'web' && index < ids.length - 1 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Ảnh sau" onPress={() => go(index + 1)} style={[styles.arrow, { right: 12 }]}>
                <SvgIcon name="chevronRight" size={22} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            )}
          </>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.close}>
          <SvgIcon name="close" size={22} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>
    </Modal>
  );
}

/** Hàng ảnh CHỈ XEM: các ảnh cùng kích thước như ở biểu mẫu (bốn ô một hàng, ô thừa để trống không vẽ); chạm một ảnh để xem toàn màn hình. Không có ảnh thì không hiện gì. */
export function PhotoStrip({ ids }: { ids: readonly string[] | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!ids || ids.length === 0) return null;
  return (
    <>
      <View style={styles.row}>
        {Array.from({ length: MAX_PHOTOS }, (_, index) => (ids[index] ? <Thumb key={ids[index]} id={ids[index]} onPress={() => setOpen(index)} /> : <View key={`gap${index}`} style={styles.cell} />))}
      </View>
      {open !== null && <Viewer ids={ids} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Khung "Ảnh đính kèm" ở các màn chi tiết (chỉ xem): tiêu đề và hàng ảnh; không có ảnh thì không hiện gì. */
export function PhotoSection({ ids }: { ids: readonly string[] | undefined }) {
  const colors = useColors();
  if (!ids || ids.length === 0) return null;
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }]}>
      <AppText weight="semibold" style={styles.sectionTitle}>
        Ảnh đính kèm
      </AppText>
      <PhotoStrip ids={ids} />
    </View>
  );
}

/**
 * Trường "Ảnh đính kèm" của các biểu mẫu: tiêu đề bên trái, nút "Thêm ảnh" ở GÓC PHẢI cùng hàng; bên dưới là bốn ô ảnh vuông bằng nhau vừa khít bề rộng khung (ảnh đã thêm hiện trong các ô đầu,
 * ô còn lại để trống; chạm ảnh để xem, nút × để bỏ). Chọn từ thư viện được NHIỀU ảnh một lúc (tối đa số ô còn trống); chụp bằng camera thì một ảnh. Ảnh được thu nhỏ rồi lưu vào kho ảnh ngay khi
 * chọn; chỉ MÃ ảnh được trả về qua `onChange` và lưu cùng bản ghi khi bấm Lưu. Ảnh đã bỏ / không lưu sẽ được dọn sau.
 */
export function PhotoField({ value, onChange }: { value: readonly string[]; onChange: (ids: string[]) => void }) {
  const colors = useColors();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const room = MAX_PHOTOS - value.length;

  async function add(source: PhotoSource) {
    if (busy || room <= 0) return;
    setBusy(true);
    try {
      const urls = await pickPhotos(source, room);
      if (urls.length === 0) return;
      const ids: string[] = [];
      for (const dataUrl of urls) {
        const id = newPhotoId(Date.now() + ids.length);
        await putPhoto(id, dataUrl);
        ids.push(id);
      }
      onChange([...value, ...ids].slice(0, MAX_PHOTOS));
    } catch (error) {
      toast.show(tr(error instanceof Error && error.message ? error.message : 'Không thêm được ảnh.'));
    } finally {
      setBusy(false);
    }
  }

  function askSource() {
    if (Platform.OS === 'web') {
      void add('library');
      return;
    }
    // Hộp chọn của hệ điều hành không đi qua bộ dịch của app: dịch tay theo ngôn ngữ đang dùng.
    Alert.alert(tr('Thêm ảnh'), undefined, [
      { text: tr('Chụp ảnh'), onPress: () => void add('camera') },
      { text: tr('Chọn từ thư viện'), onPress: () => void add('library') },
      { text: tr('Huỷ'), style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.field}>
      <View style={styles.head}>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Ảnh đính kèm ({value.length}/{MAX_PHOTOS})
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thêm ảnh"
          disabled={busy || room <= 0}
          onPress={askSource}
          style={({ pressed }) => [styles.add, { backgroundColor: colors.primarySoft, opacity: busy || room <= 0 ? 0.45 : pressed ? 0.8 : 1 }]}>
          <SvgIcon name="camera" size={16} color={colors.primary} strokeWidth={2} />
          <AppText weight="semibold" color={colors.primary} style={styles.addText}>
            Thêm ảnh
          </AppText>
        </Pressable>
      </View>
      <View style={styles.row}>
        {Array.from({ length: MAX_PHOTOS }, (_, index) =>
          value[index] ? (
            <Thumb key={value[index]} id={value[index]} onPress={() => setOpen(index)} onRemove={() => onChange(value.filter((item) => item !== value[index]))} />
          ) : (
            <Slot key={`slot${index}`} onPress={index === value.length ? askSource : undefined} disabled={busy} />
          ),
        )}
      </View>
      {open !== null && <Viewer ids={value} start={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: AppRadius.card, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 15, lineHeight: 21 },
  field: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: AppRadius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  addText: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: GAP },
  cell: { flex: 1, aspectRatio: 1 },
  fill: { flex: 1, borderRadius: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  empty: { borderStyle: 'dashed', borderWidth: 1.5 },
  image: { width: '100%', height: '100%' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pageCount: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: AppRadius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  arrow: { position: 'absolute', top: '50%', width: 40, height: 40, marginTop: -20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  page: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  pageCountText: { fontSize: 13, lineHeight: 18 },
  close: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: AppRadius.pill, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
