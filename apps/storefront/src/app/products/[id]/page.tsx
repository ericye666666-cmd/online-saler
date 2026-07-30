import { redirect } from "next/navigation";

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPage(props: ProductPageProps) {
  const { id } = await props.params;
  redirect(`/p/${encodeURIComponent(id)}`);
}
