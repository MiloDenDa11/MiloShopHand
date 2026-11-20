# Bảo mật MiloShopHand

Đợt audit ngày 19/11/2026 đã kiểm tra source, API, trình duyệt, phân quyền PostgreSQL, backup/restore và cấu hình ingress. Kết quả là đánh giá trong phạm vi local/QA, không phải chứng nhận an toàn tuyệt đối hay nghiệm thu production.

- [Báo cáo lỗ hổng, mức độ, thay đổi và bằng chứng](security/AUDIT-20261119.md).
- [Hướng dẫn triển khai production và khôi phục mã nguồn](security/PRODUCTION.md).
- [Checklist kiểm tra định kỳ cho Admin](security/CHECKLIST.md).
- [Kết quả máy đọc được](security/verification.json) và [file thay đổi](security/changes.json).

Các kiểm thử ghi dữ liệu dùng `milo_integration_test`/Redis DB1 và `milo_redesign_test`/Redis DB2, ảnh upload QA có thư mục riêng. Không chạy các bài tạo đơn trên database cửa hàng.

```powershell
npm run security:scan
npm audit
npm test
npm run test:integration
npm run test:e2e:production
npm run typecheck
npm run build
```

Phát hiện lỗi mới: giữ bằng chứng tối thiểu, che thông tin khách hàng/secret, tạo bản sửa trên source được kiểm soát và chạy lại kiểm thử liên quan. Không khai thác bên thứ ba hoặc thử DDoS để xác nhận lỗi.
