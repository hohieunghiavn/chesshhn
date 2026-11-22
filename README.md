# Chess Online – Room Code Multiplayer

Bản nâng cấp dùng Node.js + Express + Socket.IO, không cần Firebase.

## Tính năng
- Tạo phòng riêng bằng mã 6 ký tự.
- Nhập mã để tham gia phòng.
- Chủ phòng cầm Trắng, khách cầm Đen.
- Sảnh chờ trạng thái người chơi và nút Bắt đầu.
- Đồng bộ FEN và lịch sử nước đi realtime.
- Kiểm tra lượt đi và sequence trên server.
- Rời phòng; nếu người chơi thoát thì phòng trở lại trạng thái chờ.
- Phòng lưu RAM; server restart sẽ xóa phòng.

## Chạy local
1. Cài Node.js 18 trở lên.
2. Mở terminal tại thư mục này.
3. `npm install`
4. `npm start`
5. Truy cập http://localhost:3000

Để thử 2 người trên cùng máy, mở 2 trình duyệt/ cửa sổ ẩn danh. Để chơi giữa 2 thiết bị, deploy server lên dịch vụ hỗ trợ Node.js/WebSocket (Render, Railway, VPS, v.v.) và mở URL HTTPS.

## Chơi
1. Player A chọn Chơi Online → Tạo phòng.
2. Sao chép mã 6 ký tự gửi cho B.
3. Player B nhập mã → Tham gia.
4. A nhấn Bắt đầu ván.

## Lưu ý bảo mật
Đây là prototype. Server kiểm tra người chơi, màu/lượt và sequence nhưng hiện **chưa xác minh tính hợp lệ đầy đủ của nước đi bằng engine phía server**; client vẫn gửi FEN và lịch sử. Không dùng cho giải đấu/xếp hạng có giá trị cho đến khi xác minh nước đi server-side, thêm giới hạn tốc độ, chống giả mạo và quản lý kết nối.
Rooms exist only in memory and are deleted when server restarts. Disconnects remove a player; no reconnect-token recovery is implemented yet.
