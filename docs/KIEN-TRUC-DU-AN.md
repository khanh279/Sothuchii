# Kiến trúc dự án Sổ Thu Chi Mobile

> **Lưu ý (đã lỗi thời một phần):** file này là bản khung đề xuất ban đầu. Hiện trạng thực tế của ứng dụng (route, luồng nghiệp vụ, dữ liệu, component và logic dùng chung, rủi ro) nằm ở bộ tài liệu bắt đầu từ [`SO-DO-TONG-QUAN.md`](SO-DO-TONG-QUAN.md). Các chỗ lệch giữa file này và code được liệt kê ở mục 4 của [`MA-TRAN-ANH-HUONG.md`](MA-TRAN-ANH-HUONG.md).

Tài liệu này mô tả cấu trúc đích được đề xuất dựa trên dự án Expo hiện tại. Đây là bản khung để học và phát triển từng bước; chưa chuyển logic PWA cũ và chưa thay đổi màn hình mẫu.

## 1. Cây thư mục đề xuất

```text
SoThuChiMobile/
├── assets/                    # Ảnh, icon, font và tài nguyên tĩnh
├── docs/                      # Tài liệu kiến trúc, quy tắc nghiệp vụ, kiểm thử
├── scripts/                   # Script hỗ trợ phát triển
└── src/
    ├── app/                   # Route/màn hình cấp ứng dụng (Expo Router)
    │   ├── _layout.tsx        # Layout và điều hướng chung
    │   ├── index.tsx          # Route trang chính hiện tại
    │   └── explore.tsx         # Route mẫu hiện tại, có thể thay sau khi đối chiếu
    ├── components/            # Component UI dùng chung giữa nhiều tính năng
    │   └── ui/                # Component giao diện cơ sở
    ├── features/              # Mỗi nhóm tính năng có giao diện và luồng riêng
    │   ├── expenses/           # Chi tiêu cá nhân
    │   ├── funds/              # Quỹ nhóm
    │   ├── bills/              # Chia bill
    │   └── debts/              # Công nợ và thanh toán
    ├── domain/                # Quy tắc nghiệp vụ thuần, không phụ thuộc giao diện
    ├── data/                  # Lưu trữ, truy vấn, migration và repository
    ├── types/                 # Kiểu dữ liệu TypeScript dùng chung
    ├── utils/                 # Hàm tiện ích dùng chung, không chứa quy tắc nghiệp vụ lớn
    ├── constants/             # Hằng số, cấu hình giao diện và giá trị cố định
    ├── hooks/                 # React hooks dùng chung
    └── global.css             # CSS dùng cho nền tảng web nếu còn cần
```

## 2. Vai trò của từng tầng

- **`app/`**: điều hướng và gắn màn hình vào route. Không nên đặt công thức chia bill hay tính nợ tại đây.
- **`features/`**: giao diện và luồng thao tác theo tính năng. Ví dụ `features/expenses/ExpenseScreen.tsx` hiển thị màn hình chi tiêu và gọi hàm nghiệp vụ.
- **`domain/`**: quy tắc cốt lõi như tính tổng bill, phân bổ khoản thanh toán, tính số dư công nợ. Hàm tại đây nên dễ kiểm thử và không gọi trực tiếp React Native hoặc cơ sở dữ liệu.
- **`data/`**: đọc/ghi dữ liệu, cơ sở dữ liệu cục bộ, chuyển đổi dữ liệu cũ và sao lưu/khôi phục.
- **`types/`**: định nghĩa kiểu `Expense`, `Fund`, `Bill`, `Payment`... để các module dùng cùng một cấu trúc.
- **`utils/`**: tiện ích nhỏ như định dạng ngày hoặc tiền. Không để cùng một quy tắc nghiệp vụ bị viết lại ở nhiều nơi.
- **`components/`**: các thành phần giao diện có thể tái sử dụng, ví dụ nút, ô nhập tiền, thẻ giao dịch, hộp thoại xác nhận.

## 3. Quy tắc phụ thuộc giữa các tầng

```text
app/  →  features/  →  domain/
                    ↘ data/ (qua giao diện/repository phù hợp)
components/, types/, utils/, constants/ được dùng chung khi cần
```

Nguyên tắc: giao diện gọi nghiệp vụ; nghiệp vụ không phụ thuộc giao diện. Mã nghiệp vụ không nên tự đọc `localStorage`, thao tác DOM hoặc gọi `Alert` của React Native. Những việc đó thuộc tầng dữ liệu hoặc giao diện.

## 4. Ánh xạ từ dự án hiện tại

| Đường dẫn hiện tại | Vai trò hiện tại / đề xuất | Hành động lúc này |
|---|---|---|
| `src/app/_layout.tsx` | Layout và điều hướng Expo Router | Giữ nguyên, chưa đổi vội |
| `src/app/index.tsx` | Route trang chính mẫu | Đọc trước khi thay bằng màn hình thật |
| `src/app/explore.tsx` | Route khám phá mẫu Expo | Chưa xóa; xác định có còn dùng không |
| `src/components/*` | Component mẫu Expo có thể tái sử dụng | Giữ lại, rà soát từng component |
| `src/constants/theme.ts` | Màu sắc/theme mẫu | Tận dụng nếu phù hợp với giao diện PWA |
| `src/features/expenses/ExpenseScreen.tsx` | Màn hình chi tiêu đang khởi tạo | Giữ, so sánh với giao diện PWA trước khi sửa |
| `src/features/funds/` | Dự kiến chứa tính năng quỹ nhóm | Chưa có logic nghiệp vụ xác nhận |
| `src/features/bills/` | Dự kiến chứa tính năng chia bill | Chưa có logic nghiệp vụ xác nhận |
| `src/features/debts/` | Dự kiến chứa tính năng công nợ | Chưa có logic nghiệp vụ xác nhận |
| `src/domain/` | Nghiệp vụ thuần | Tạo module sau khi chốt quy tắc |
| `src/data/` | Lưu trữ và chuyển đổi dữ liệu | Chọn giải pháp sau khi kiểm tra yêu cầu offline/migration |
| `src/types/` | Kiểu dữ liệu chung | Định nghĩa theo mô hình đã xác minh |
| `src/utils/` | Hàm tiện ích | Chỉ thêm hàm thực sự dùng chung |

## 5. Ánh xạ logic từ PWA cũ (sau khi kiểm tra mã nguồn)

| Phần PWA | Vị trí mobile dự kiến | Lưu ý |
|---|---|---|
| Giao diện từng tab/màn hình | `src/features/<module>/` | Chuyển HTML/CSS sang component React Native; không sao chép nguyên xi DOM |
| Hàm tính toán độc lập | `src/domain/` | Giữ hành vi cũ, thêm kiểm thử trước/sau chuyển đổi |
| `localStorage` và thao tác lưu/đọc | `src/data/` | Không dùng trực tiếp trong native; cần lớp lưu trữ tương thích |
| Định dạng tiền/ngày | `src/utils/` | Chuẩn hóa đơn vị, không làm tròn tùy tiện |
| Kiểu dữ liệu và cấu trúc backup | `src/types/` và `src/data/` | Cần kiểm tra phiên bản và tương thích ngược |
| Màu sắc, biểu tượng, hình ảnh | `src/constants/`, `assets/` | Tận dụng tài nguyên cũ khi giấy phép/định dạng phù hợp |

## 6. Nguyên tắc về tiền và công nợ

1. Trước khi chuyển đổi phải ghi nhận chính xác đơn vị tiền của từng module cũ.
2. Không tự đổi từ nghìn đồng sang đồng nếu chưa xác định nơi dữ liệu được đổi.
3. Các khoản nợ nên được tính từ dữ liệu bill và giao dịch theo quy tắc đã xác nhận, tránh lưu hai nguồn số dư có thể lệch nhau.
4. Thay đổi nghiệp vụ phải có ví dụ đầu vào/đầu ra và kiểm thử hồi quy.
5. Sao lưu dữ liệu trước mọi migration; không xóa khóa hoặc trường cũ khi chưa có phương án chuyển đổi.

## 7. Thứ tự triển khai khuyến nghị

1. Kiểm kê PWA và dự án Expo, xác định màn hình/logic/dữ liệu thực tế.
2. Lập tài liệu quy tắc nghiệp vụ và bộ ví dụ kiểm thử.
3. Chốt mô hình dữ liệu và chiến lược lưu trữ offline.
4. Chuyển một module nhỏ làm mẫu, kiểm thử trên thiết bị/web.
5. Tái sử dụng và chuyển từng module còn lại.
6. Chuyển đổi dữ liệu, sao lưu/khôi phục và kiểm thử hồi quy.

**Trạng thái hiện tại:** đây là tài liệu kiến trúc đề xuất, không phải tuyên bố rằng mọi chức năng đã được triển khai. Các màn hình Expo mẫu vẫn được giữ nguyên để tránh phá cấu hình hiện tại.
