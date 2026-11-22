# Deploy để chơi Internet

## Render (gợi ý)
1. Tạo repository Git và upload toàn bộ thư mục source.
2. Render Dashboard → New → Web Service → kết nối repo.
3. Runtime Node; Build command: `npm install`; Start command: `npm start`.
4. Chọn gói phù hợp; chờ deploy thành công và lấy URL HTTPS.
5. Mở URL trên 2 thiết bị. Socket.IO dùng cùng origin nên không cần sửa cấu hình.

## Railway hoặc VPS
- Deploy project Node.js.
- Đảm bảo service sử dụng `process.env.PORT` (server đã hỗ trợ).
- Proxy phải hỗ trợ WebSocket; Socket.IO có thể fallback long-polling.
- Dùng HTTPS khi site public.

## Thử nghiệm
- Server local: `npm install && npm start`.
- Kiểm tra `http://localhost:3000/health` trả `{ "ok": true, ... }`.
- Mở 2 tab, tạo phòng ở tab 1, nhập mã ở tab 2, chủ phòng bắt đầu.
