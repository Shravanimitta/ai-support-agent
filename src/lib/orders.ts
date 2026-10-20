const orders = {
  "ORD-123": {
    id: "ORD-123",
    item: "Running Shoes",
    status: "delayed",
  },

  "ORD-456": {
    id: "ORD-456",
    item: "Backpack",
    status: "delivered",
  },

  "ORD-789": {
    id: "ORD-789",
    item: "Headphones",
    status: "processing",
  },
};

export function getOrder(orderId: string) {
  const order = orders[orderId as keyof typeof orders] ?? null;

  if (!order) {
    return {
      found: false,
      orderId,
      reason: "not_found",
    };
  }

  return {
    found: true,
    order,
  };
}