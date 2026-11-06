import { Skeleton } from "../components/client";
export default function Loading() {
  return (
    <div className="container section" style={{minHeight:"100dvh"}}>
      <p>Đang tải cửa hàng…</p>
      <Skeleton />
    </div>
  );
}
