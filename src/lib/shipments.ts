const shipments = {
  "ORD-123": {
    orderId: "ORD-123",
    carrier: "UPS",
    trackingNumber: "1Z999AA101",
    shippingStatus: "in_transit",
    lastLocation: "Dallas, TX",
    estimatedDelivery: "October 10, 2026",
  },

  "ORD-456": {
    orderId: "ORD-456",
    carrier: "FedEx",
    trackingNumber: "FDX-456789",
    shippingStatus: "delivered",
    lastLocation: "Austin, TX",
    deliveredDate: "October 5, 2026",
  },

  "ORD-789": {
    orderId: "ORD-789",
    carrier: null,
    trackingNumber: null,
    shippingStatus: "not_shipped",
  },
};

export function getShipment(orderId: string) {
  const shipment =  shipments[orderId as keyof typeof shipments] ?? null;
  if (!shipment) {
    return {
      found: false,
      orderId,
      reason: "not_found",
    };
  }

  return {
    found: true,
    shipment,
  };
}