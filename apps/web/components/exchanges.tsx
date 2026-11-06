"use client";
import { useEffect, useState } from "react";
import { useResource } from "./store";
import { api, send, useShop, money, ErrorBox } from "./client";
export function MyExchanges() {
  const { data, error, retry } = useResource("/exchanges");
  const { notify } = useShop();
  return (
    <div>
      <h3>Đề nghị đổi size</h3>
      {error && <ErrorBox message={error} />}
      <p className="small muted">
        Cửa hàng giữ size thay thế 48 giờ sau khi kiểm tra hàng hoàn đạt. Bạn
        xác nhận chi phí trước khi gửi; khoản phát sinh chỉ được ghi nhận sau
        đối soát có chứng từ.
      </p>
      {data?.length ? (
        data.map((e: any) => (
          <div className="form-panel" key={e.id}>
            <b>
              {e.snapshot.name} / {e.snapshot.color} / {e.snapshot.size} ×{" "}
              {e.quantity}
            </b>
            <p className="small">
              Đơn gốc {e.returnItem.request.order.code} · {e.status}
              <br />
              Chênh lệch giá: {money(e.priceDifference)} · Phí giao:{" "}
              {money(e.shippingFee)}
              <br />
              Cần trả thêm: {money(e.due)} · Đã đối soát: {money(e.received)} ·
              Cần hoàn lại: {money(e.refundDue)}
              <br />
              Giữ size đến:{" "}
              {new Date(e.expiresAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
              <br />
              Vận đơn thay thế: {e.trackingCode || "Chưa tạo"}
            </p>
            {e.status === "OFFERED" && (
              <button
                className="button secondary small-button"
                onClick={async () => {
                  try {
                    await send(`/exchanges/${e.id}/accept`, {});
                    notify("Đã chấp nhận đề nghị đổi size.");
                    retry();
                  } catch (error: any) {
                    notify(error.message);
                  }
                }}
              >
                Đồng ý size thay thế và chi phí
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="small muted">Chưa có đề nghị đổi size.</p>
      )}
    </div>
  );
}
export function ExchangeOffer({
  returnItemId,
  onDone,
}: {
  returnItemId: string;
  onDone: () => void;
}) {
  const { notify } = useShop();
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    api("/admin/inventory")
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <details>
      <summary>Đề nghị đổi size sau kiểm tra đạt</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await send("/admin/exchanges", {
              returnItemId,
              replacementVariantId: f.get("variant"),
              shippingFee: Number(f.get("fee")),
              reason: f.get("reason"),
            });
            notify("Đã giữ size mới và gửi đề nghị cho khách trong tài khoản.");
            onDone();
          } catch (e: any) {
            notify(e.message);
          }
        }}
      >
        <label>
          SKU thay thế (cùng sản phẩm)
          <select name="variant" required>
            {data.map((i) => (
              <option key={i.id} value={i.variantId}>
                {i.variant.product.name} / {i.variant.sku} / có thể bán{" "}
                {i.onHand - i.reserved}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phí giao hàng thay thế VND
          <input type="number" name="fee" min="0" defaultValue={0} required />
        </label>
        <label>
          Lý do / thỏa thuận
          <input name="reason" minLength={5} required />
        </label>
        <button className="button secondary small-button">
          Giữ size và tạo đề nghị
        </button>
      </form>
    </details>
  );
}
export function AdminExchanges() {
  const { data, error, retry } = useResource("/admin/exchanges");
  const { notify } = useShop();
  return (
    <div>
      {error && <ErrorBox message={error} retry={retry} />}
      <p className="admin-note">
        Kho đã giữ được ghi trong từng đề nghị. Khoản bổ sung dùng đối soát
        chuyển khoản thủ công có chứng từ; không có nút tự báo đã thanh toán cho
        khách.
      </p>
      {data?.map((e: any) => (
        <div className="admin-panel" key={e.id}>
          <h3>
            {e.returnItem.request.order.code} → {e.snapshot.sku}
          </h3>
          <p className="small">
            {e.snapshot.name} / {e.snapshot.color} / {e.snapshot.size} ×{" "}
            {e.quantity}
            <br />
            Trạng thái {e.status} · Chênh lệch {money(e.priceDifference)} · Phí{" "}
            {money(e.shippingFee)}
            <br />
            Phải thu {money(e.due)} / Đã đối soát {money(e.received)} / Phải
            hoàn {money(e.refundDue)}
            <br />
            Vận đơn {e.trackingCode || "Chưa tạo"}
          </p>
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              try {
                await send(`/admin/exchanges/${e.id}/action`, {
                  action: f.get("action"),
                  reason: f.get("reason"),
                });
                notify("Đã cập nhật đổi size.");
                retry();
              } catch (err: any) {
                notify(err.message);
              }
            }}
          >
            <label>
              Lý do / chứng cứ giao hàng
              <input name="reason" minLength={5} required />
            </label>
            <div className="row">
              <select name="action" aria-label="Thao tác đổi size">
                <option value="CREATE_SHIPMENT">Tạo vận đơn</option>
                <option value="SHIP">Đã bàn giao, xuất kho</option>
                <option value="DELIVER">Đã giao có chứng cứ</option>
                <option value="CANCEL">Hủy chưa có vận đơn / thu tiền</option>
              </select>
              <button className="button secondary small-button">
                Thực hiện
              </button>
            </div>
          </form>
          {e.due > e.received && e.status === "ACCEPTED" && (
            <details>
              <summary>Đối soát khoản bổ sung</summary>
              <form
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  try {
                    await send(`/admin/exchanges/${e.id}/reconcile`, {
                      amount: Number(f.get("amount")),
                      reference: f.get("reference"),
                      evidence: f.get("evidence"),
                    });
                    notify("Đã lưu bằng chứng đối soát.");
                    retry();
                  } catch (err: any) {
                    notify(err.message);
                  }
                }}
              >
                <label>
                  Số tiền VND
                  <input
                    type="number"
                    name="amount"
                    min="1"
                    max={e.due - e.received}
                    required
                  />
                </label>
                <label>
                  Tham chiếu ngân hàng duy nhất
                  <input name="reference" minLength={5} required />
                </label>
                <label>
                  Bằng chứng đối soát
                  <input name="evidence" minLength={10} required />
                </label>
                <button className="button secondary small-button">
                  Lưu chứng từ
                </button>
              </form>
            </details>
          )}
        </div>
      ))}
      {data?.length === 0 && (
        <p className="no-data">Chưa có đề nghị đổi size.</p>
      )}
    </div>
  );
}
