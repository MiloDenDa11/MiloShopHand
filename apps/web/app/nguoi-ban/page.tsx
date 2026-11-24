import { SellerWorkspace } from '../../components/seller';
export const metadata = { title: 'Không gian Người bán', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const query = await searchParams;
  return <SellerWorkspace initialOrder={typeof query.order === 'string' ? query.order : ''} />;
}
