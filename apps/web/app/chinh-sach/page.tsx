import { Suspense } from "react";
import { Policies } from "../../components/editorial";
import { serverApi } from "../../lib/server-api";
export const metadata = { title: "Hỗ trợ & chính sách" };
export default async function Page() {
  const initialConfig = await serverApi("/config");
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <Policies initialConfig={initialConfig} />
    </Suspense>
  );
}
