import { OrderDetail } from "../../../components/account";
export const metadata = { title: "??n h?ng", robots: { index: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
