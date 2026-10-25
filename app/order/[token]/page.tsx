import OrderStatus from "./order-status";

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderStatus token={token} />;
}
