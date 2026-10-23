# Quy tắc làm việc cho SoThuChiMobile

## Mục tiêu
- Bảo toàn nghiệp vụ và dữ liệu hiện có.
- Ưu tiên tái sử dụng kiến trúc, module, component và test đã có.
- Tiết kiệm context: chỉ đọc phần cần thiết, không quét lại toàn dự án nếu không có lý do.

## Trước khi làm
1. Đọc `docs/SESSION-STATE.md` nếu tồn tại.
2. Kiểm tra `git status --short` và nhánh/commit hiện tại.
3. Xác định phạm vi nhiệm vụ và liệt kê file dự kiến cần đọc/sửa.
4. Đọc các file liên quan trực tiếp cùng test của chúng; chỉ mở rộng phạm vi khi có bằng chứng cần thiết.
5. Nếu yêu cầu mơ hồ hoặc có nguy cơ thay đổi dữ liệu/nghiệp vụ, hỏi trước khi sửa.

## Trong khi làm
- Chỉ thực hiện đúng nhiệm vụ được giao; không tự tiện refactor hoặc sửa module ngoài phạm vi.
- Không viết lại file lớn khi một thay đổi nhỏ là đủ.
- Không tạo logic tính toán trùng lặp nếu đã có domain function phù hợp.
- Không tự ý đổi schema, khóa lưu trữ, định dạng dữ liệu, ý nghĩa trường hoặc luồng migration.
- Không xóa dữ liệu, file hoặc test để làm cho kiểm tra xanh.
- Không thêm thư viện mới nếu API có sẵn hoặc thư viện hiện tại đã đáp ứng; nếu cần thêm, nêu lý do trước.
- PWA gốc là chuẩn tham chiếu cho giao diện/trải nghiệm/nghiệp vụ khi nhiệm vụ liên quan đến đối chiếu PWA.
- Ngày tháng phải theo giờ địa phương khi nghiệp vụ yêu cầu; không dùng `toISOString()` để suy ra ngày lịch địa phương.
- Không tuyên bố đã chạy trên iPhone hoặc xác minh giao diện thật nếu chưa thực hiện được.

## Kiểm thử
- Chạy test liên quan trực tiếp trước.
- Chạy TypeScript/ESLint hoặc toàn bộ test khi thay đổi có phạm vi rộng, ảnh hưởng chung, hoặc được yêu cầu.
- Báo chính xác lệnh đã chạy và kết quả; phân biệt kiểm tra đã chạy với kiểm tra chưa chạy.
- Nếu test thất bại vì lỗi có sẵn/ngoài phạm vi, báo rõ; không âm thầm sửa ngoài phạm vi.

## Quản lý context
- Không in toàn bộ file hoặc log dài vào hội thoại; chỉ tóm tắt phần liên quan.
- Không tự động đọc lại toàn bộ lịch sử Git, toàn bộ thư mục hoặc mọi file tài liệu.
- Khi cần tìm kiếm, tìm theo tên hàm, route, component hoặc khóa dữ liệu cụ thể.
- Kết thúc mỗi nhiệm vụ bằng báo cáo ngắn: thay đổi, file, test, rủi ro và việc còn lại.
- Khi người dùng yêu cầu bàn giao hoặc trước khi dùng `/clear`, cập nhật `docs/SESSION-STATE.md`. Không lưu bí mật, token, mật khẩu hoặc dữ liệu cá nhân vào file này.

## Định dạng báo cáo cuối
1. **Đã làm:** 1–5 gạch đầu dòng.
2. **File thay đổi:** đường dẫn và mục đích.
3. **Kiểm tra:** lệnh và kết quả thực tế.
4. **Chưa làm/rủi ro:** nêu rõ hoặc ghi “Không phát hiện trong phạm vi đã kiểm tra”.
5. **Commit:** chỉ ghi nếu đã thực sự tạo commit; không tự commit nếu chưa được yêu cầu.
