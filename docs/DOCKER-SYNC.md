# Đồng bộ và chuyển dữ liệu sang Docker — 05/11/2026

Thư mục làm việc chính: `C:\Users\LOQ\OneDrive\Desktop\MiloShopHand`.
Nguồn cập nhật: `D:\MiloShopHand`. Mã nguồn và database gốc ở ổ D được giữ nguyên.

## Đồng bộ tệp

- So sánh SHA-256 và thời gian sửa của từng tệp: cập nhật 29 tệp mới hơn từ ổ D, thêm 105 tệp còn thiếu, giữ 84 tệp chỉ có ở Desktop.
- Giữ lại giao diện mới, bản sửa API, tài liệu, ảnh kiểm thử đã có, email phát triển và ảnh đổi trả. Không đồng bộ `node_modules`, build output, PostgreSQL data directory hoặc ghi đè Git đang có.
- Thư mục đích trước đây chưa có `.git`; đã sao chép metadata Git của nguồn. Repository nguồn chưa có commit.
- `.env` dùng secret của bản D để phù hợp MFA/email mã hóa trong database chính. Secret của bản Desktop được sao lưu riêng cùng dữ liệu Desktop.
- Backup hai phiên bản tệp và manifest: `.local/sync-backups/2026-11-05T00-36-12-688Z/`. Thời gian trong tên thư mục là UTC.

Đồng bộ lần sau tại thư mục đích:

```powershell
# Chỉ xem kế hoạch, chưa thay đổi tệp.
npm run sync:project -- D:\MiloShopHand
# Áp dụng sau khi kiểm tra kế hoạch; tự backup trước khi ghi đè.
npm run sync:project -- D:\MiloShopHand --apply
```

Script giữ tệp mới hơn ở đích và tệp chỉ có ở đích; không xóa tệp. `.env` được giữ nguyên mặc định để bảo vệ cấu hình của database đang chạy; chỉ dùng `--include-env` khi chủ động chuyển cả database và secret tương ứng. Nếu hai tệp mã nguồn khác nội dung nhưng cùng thời gian sửa, script dừng trước khi ghi. Đây là đồng bộ tệp một chiều, không tự ghép nội dung hoặc database. Tiếp tục sửa dự án tại thư mục Desktop để tránh phát triển song song hai bản.

## Dữ liệu PostgreSQL

Hai cluster cũ cùng PostgreSQL 18 nhưng có các ID và dữ liệu thử khác nhau. Không ghép hàng theo SKU/email vì có thể làm sai quan hệ đơn hàng và tồn kho.

| Database Docker | Nguồn | Dữ liệu khi chuyển |
| --- | --- | --- |
| `milo` | Ổ D, có giao dịch mới hơn | 30 sản phẩm, 240 SKU, 8 tài khoản, 4 đơn, 7 migrations |
| `milo_desktop_archive_20261105` | Desktop trước đồng bộ | 30 sản phẩm, 274 SKU, 23 tài khoản, 39 đơn, 6 migrations |
| `milo_integration_test` | Kiểm thử API | Database kiểm thử riêng |
| `milo_redesign_test` | Kiểm thử giao diện | Database kiểm thử riêng |

Đã khôi phục bằng `pg_dump`/`pg_restore` phiên bản 18 vào volume Linux. Mỗi bản được kiểm tra toàn bộ 42 bảng, đối chiếu số dòng và SHA-256 nội dung từng hàng; timestamp có múi giờ được chuẩn hóa về UTC khi so sánh. Không copy trực tiếp PostgreSQL data directory từ Windows vào container Linux.

Sao lưu nằm tại `.local/database-migration/2026-11-05/`:

- `source-latest.dump` và `source.env`: dữ liệu/cấu hình bản D.
- `desktop-before-sync.dump` và `desktop-before-sync.env`: dữ liệu/cấu hình Desktop trước đồng bộ.
- `source-native/`, `destination-native/`: bản sao cluster đã được phục hồi để xuất dump, sau đó dừng.
- `comparison.json`, `*-restore-verification.json`: báo cáo đối chiếu.
- `*-rows.private.json`: ảnh chụp dữ liệu chỉ dùng đối chiếu cục bộ, có thể chứa dữ liệu riêng tư.

Tất cả nằm trong `.local`, được loại khỏi Git và Docker build context. Giữ file môi trường tương ứng với từng dump để giải mã MFA/email; không chia sẻ hoặc commit các file này.

## Vận hành Docker

```powershell
npm run infra:up
npm run infra:status
npm run infra:logs
npm run infra:stop
```

PostgreSQL 18.6: `localhost:5432`, volume `miloshophand_postgres18_data`, mount `/var/lib/postgresql` theo layout image PostgreSQL 18. Redis 7.4.11: `localhost:6379`, volume `miloshophand_redis_data`, AOF bật, fsync mỗi giây, `noeviction` cho hàng đợi BullMQ. Cổng chỉ bind `127.0.0.1`; restart policy `unless-stopped`.

Redis DB 0 dành cho cửa hàng, DB 1 cho integration và DB 2 cho E2E để tránh dùng chung cache, rate limit hoặc job giữa các database PostgreSQL khác nhau. Không chạy worker cũ ở ổ D cùng worker mới trên cùng Redis DB.

`npm run infra:stop` chỉ dừng hai dịch vụ, giữ volumes. `docker compose down -v` xóa volumes; không dùng để dừng hằng ngày. Thay port bằng `POSTGRES_PORT`/`REDIS_PORT` trong `.env` thì phải sửa cả `DATABASE_URL`/`REDIS_URL` tương ứng. `POSTGRES_PASSWORD` phải khớp mật khẩu trong `DATABASE_URL`; đổi biến này không tự đổi mật khẩu của database đã khởi tạo.

Tham khảo: [layout PostgreSQL Docker 18](https://hub.docker.com/_/postgres), [Docker volumes](https://docs.docker.com/engine/storage/volumes/), [Redis AOF](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

## Backup và phục hồi

```powershell
# Lưu binary dump trong .local/backups, không đưa binary qua PowerShell pipeline.
npm run db:backup
# Hoặc chọn tên file mới.
npm run db:backup -- .local/backups/milo-manual.dump
# Mặc định phục hồi vào database milo_restore.
npm run db:restore -- .local/backups/milo-manual.dump
# Hoặc chỉ định một database mới/đang trống.
npm run db:restore -- .local/backups/milo-manual.dump --database milo_restore_check
```

Restore từ chối database đã có dữ liệu. Lệnh dùng `--single-transaction`, `--exit-on-error`, giữ nguyên database đang sử dụng. Không seed lại database đã phục hồi nếu chỉ cần tiếp tục chạy dữ liệu hiện tại. Sao lưu cả `.env`, ảnh catalog và ảnh đổi trả cùng database.

## Kiểm tra sau cập nhật

Build và TypeScript đạt; 5/5 unit nghiệp vụ, 6/6 kiểm thử đồng bộ, 16/16 integration và 9/9 Playwright đạt. Đã kiểm tra tạo lại container vẫn giữ đủ dữ liệu PostgreSQL/Redis, backup/restore đủ 42 bảng và restore từ chối ghi đè database đang có dữ liệu. Chi tiết trong [báo cáo xác minh](VERIFICATION.md).
