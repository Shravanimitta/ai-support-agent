export type EvalMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExpectedToolCall = {
  name: string;
  args?: Record<string, string>;
};

export type EvalCase = {
  name: string;
  messages: EvalMessage[];
  expectedTools: ExpectedToolCall[];

  mustInclude?: string[];
  mustNotInclude?: string[];
};

export const evalCases: EvalCase[] = [
  {
  name: "shipment lookup",
  messages: [
    {
      role: "user",
      content: "Where is ORD-123?",
    },
  ],
  expectedTools: [
    {
      name: "get_shipment",
      args: {
        orderId: "ORD-123",
      },
    },
  ],

  mustInclude: [
    "Dallas",
    "UPS",
    "October 10, 2026",
  ],

  mustNotInclude: [
    "contact support",
    "customer service",
    "http",
    "www.",
  ],
},

  {
    name: "order item lookup",
    messages: [
      {
        role: "user",
        content: "What did I order in ORD-123?",
      },
    ],
    expectedTools: [
      {
        name: "get_order",
        args: {
          orderId: "ORD-123",
        },
      },
    ],
  },

  {
    name: "refund eligibility",
    messages: [
      {
        role: "user",
        content: "Can I get a refund for ORD-123?",
      },
    ],
    expectedTools: [
      {
        name: "get_shipment",
        args: {
          orderId: "ORD-123",
        },
      },
      {
        name: "search_policy",
      },
    ],
  },

  {
    name: "missing order id",
    messages: [
      {
        role: "user",
        content: "Where is my package?",
      },
    ],
    expectedTools: [],
  },

  {
    name: "unknown order",
    messages: [
      {
        role: "user",
        content: "Where is ORD-999?",
      },
    ],
    expectedTools: [
      {
        name: "get_shipment",
        args: {
          orderId: "ORD-999",
        },
      },
    ],
  },

  {
    name: "multiple information sources",
    messages: [
      {
        role: "user",
        content: "What did I order in ORD-123 and where is it?",
      },
    ],
    expectedTools: [
      {
        name: "get_order",
        args: {
          orderId: "ORD-123",
        },
      },
      {
        name: "get_shipment",
        args: {
          orderId: "ORD-123",
        },
      },
    ],
  },

  {
    name: "conversation memory",
    messages: [
      {
        role: "user",
        content: "Where is ORD-123?",
      },
      {
        role: "assistant",
        content:
          "ORD-123 is currently in transit with UPS and has an estimated delivery date of October 10, 2026.",
      },
      {
        role: "user",
        content: "Can I get a refund?",
      },
    ],
    expectedTools: [
      {
        name: "get_shipment",
        args: {
          orderId: "ORD-123",
        },
      },
      {
        name: "search_policy",
      },
    ],
  },

  {
    name: "compare two orders",
    messages: [
      {
        role: "user",
        content: "Compare ORD-123 and ORD-456.",
      },
    ],
    expectedTools: [
      {
        name: "get_order",
        args: {
          orderId: "ORD-123",
        },
      },
      {
        name: "get_order",
        args: {
          orderId: "ORD-456",
        },
      },
    ],
  },
];

