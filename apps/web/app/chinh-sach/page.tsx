import { Suspense } from "react";
import { Policies } from "../../components/editorial";
export const metadata = { title: "Hỗ trợ & chính sách" };
export default function Page() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <Policies />
    </Suspense>
  );
}
