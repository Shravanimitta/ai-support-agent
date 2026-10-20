import { getOrder } from "../../../lib/orders";
import { getShipment } from "../../../lib/shipments";
import { searchPolicies } from "../../../lib/policySearch";

type ToolArgs = {
  orderId?: string;
  query?: string;
};

type ToolCall = {
  function: {
    name: string;
    arguments: ToolArgs;
  };
};

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_calls?: ToolCall[];
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type OllamaResponse = {
  message: OllamaMessage;
};

type OllamaStreamChunk = {
  message?: {
    content?: string;
  };
  done?: boolean;
  error?: string;
};

const MODEL =
  process.env.OLLAMA_MODEL ?? "qwen3:8b";

const MAX_STEPS = 5;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
) {
  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_order",
      description:
        "Get order-level information such as item and overall order status.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description:
              "The order ID",
          },
        },
        required: ["orderId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_shipment",
      description:
        "Get current shipment information including shipping status, carrier, tracking number, last location, and estimated delivery date.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description:
              "The order ID",
          },
        },
        required: ["orderId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "search_policy",
      description:
        "Search company policy for refunds, returns, cancellations, replacements, compensation, and other policy questions. Use a specific customer situation as the query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A specific policy question or customer situation",
          },
        },
        required: ["query"],
      },
    },
  },
];

async function executeTool(
  name: string,
  args: ToolArgs
) {
  if (
    name === "get_order" &&
    args.orderId
  ) {
    return getOrder(args.orderId);
  }

  if (
    name === "get_shipment" &&
    args.orderId
  ) {
    return getShipment(
      args.orderId
    );
  }

  if (
    name === "search_policy" &&
    args.query
  ) {
    return searchPolicies(
      args.query
    );
  }

  return {
    error:
      `Invalid arguments for tool: ${name}`,
  };
}

function extractOrderIds(
  text: string
) {
  const matches =
    text.match(
      /\bORD-\d+\b/gi
    ) ?? [];

  return [
    ...new Set(
      matches.map((id) =>
        id.toUpperCase()
      )
    ),
  ];
}

function hasAmbiguousReference(
  text: string
) {
  return /\b(it|that order|the order|that package|the package|that shipment|the shipment)\b/i.test(
    text
  );
}

/*
 * ------------------------------------------------
 * Stream final customer-facing answer
 * ------------------------------------------------
 *
 * Tool selection remains non-streaming.
 *
 * Once all required tool data has been gathered,
 * this makes one final Ollama request with
 * stream:true and forwards text chunks to the
 * browser as they arrive.
 */
async function streamFinalAnswer(
  messages: OllamaMessage[]
) {
  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const response =
      await fetch(
        "http://localhost:11434/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          signal:
            controller.signal,

          body: JSON.stringify({
            model: MODEL,

            messages: [
              ...messages,

              {
                role: "system",
                content: `
Produce the final customer-facing response now.

Use only information already retrieved.

Do not call tools.

Do not mention tools, APIs, models, prompts, retrieval systems, or implementation details.

Answer only the customer's current question.

Answer directly and concisely.
                `,
              },
            ],

            // No tools here.
            // This request is only for the
            // final customer-facing response.
            stream: true,

            think: false,

            options: {
              temperature: 0,
            },
          }),
        }
      );

    if (!response.ok) {
      clearTimeout(timeout);

      throw new Error(
        `Ollama streaming request failed: ${response.status}`
      );
    }

    if (!response.body) {
      clearTimeout(timeout);

      throw new Error(
        "Ollama streaming response has no body"
      );
    }

    const ollamaBody =
      response.body;

    const encoder =
      new TextEncoder();

    const decoder =
      new TextDecoder();

    const outputStream =
      new ReadableStream<Uint8Array>(
        {
          async start(
            outputController
          ) {
            const reader =
              ollamaBody.getReader();

            let buffer = "";

            try {
              while (true) {
                const {
                  value,
                  done,
                } =
                  await reader.read();

                if (done) {
                  break;
                }

                buffer +=
                  decoder.decode(
                    value,
                    {
                      stream: true,
                    }
                  );

                /*
                 * Ollama sends newline-delimited JSON.
                 *
                 * Example:
                 *
                 * {"message":{"content":"Your"}}
                 * {"message":{"content":" package"}}
                 */
                const lines =
                  buffer.split("\n");

                buffer =
                  lines.pop() ??
                  "";

                for (
                  const line of lines
                ) {
                  if (
                    !line.trim()
                  ) {
                    continue;
                  }

                  const chunk =
                    JSON.parse(
                      line
                    ) as OllamaStreamChunk;

                  if (
                    chunk.error
                  ) {
                    throw new Error(
                      chunk.error
                    );
                  }

                  const content =
                    chunk.message
                      ?.content;

                  if (content) {
                    outputController.enqueue(
                      encoder.encode(
                        content
                      )
                    );
                  }
                }
              }

              /*
               * Process a final JSON object
               * if Ollama didn't terminate
               * it with a newline.
               */
              if (
                buffer.trim()
              ) {
                const chunk =
                  JSON.parse(
                    buffer
                  ) as OllamaStreamChunk;

                if (
                  chunk.error
                ) {
                  throw new Error(
                    chunk.error
                  );
                }

                const content =
                  chunk.message
                    ?.content;

                if (content) {
                  outputController.enqueue(
                    encoder.encode(
                      content
                    )
                  );
                }
              }

              outputController.close();
            } catch (error) {
              outputController.error(
                error
              );
            } finally {
              clearTimeout(
                timeout
              );

              reader.releaseLock();
            }
          },

          cancel() {
            clearTimeout(
              timeout
            );

            controller.abort();
          },
        }
      );

    return new Response(
      outputStream,
      {
        status: 200,

        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",

          "Cache-Control":
            "no-cache",

          "X-Content-Type-Options":
            "nosniff",
        },
      }
    );
  } catch (error) {
    clearTimeout(timeout);

    throw error;
  }
}

export async function POST(
  request: Request
) {
  const requestStartedAt =
    Date.now();

  /*
   * New trace for every request.
   */
  const trace = {
    steps: 0,

    tools: [] as {
      name: string;
      args: ToolArgs;
    }[],
  };

  try {
    const body =
      await request.json();

    /*
     * Existing evals don't send this,
     * so they continue receiving JSON.
     *
     * The browser will eventually send
     * stream:true.
     */
    const wantsStream =
      body.stream === true;

    const conversation: ConversationMessage[] =
      body.messages ?? [];

    const currentDate =
      new Date()
        .toISOString()
        .split("T")[0];

    const latestUserIndex =
      [...conversation]
        .map(
          (message) =>
            message.role
        )
        .lastIndexOf(
          "user"
        );

    const latestUserMessage =
      latestUserIndex >= 0
        ? conversation[
            latestUserIndex
          ].content
        : "";

    const priorConversation =
      latestUserIndex >= 0
        ? conversation.slice(
            0,
            latestUserIndex
          )
        : [];

    /*
     * Only use recent context
     * to resolve references.
     */
    const recentContext =
      priorConversation
        .slice(-2)
        .map(
          (message) =>
            message.content
        )
        .join(" ");

    const explicitIds =
      extractOrderIds(
        latestUserMessage
      );

    const previousIds =
      extractOrderIds(
        recentContext
      );

    /*
     * Resolution priority:
     *
     * 1. Explicit ID in current request
     * 2. One unambiguous recent ID
     */
    const resolvedOrderId =
      explicitIds.length === 1
        ? explicitIds[0]
        : explicitIds.length ===
              0 &&
            previousIds.length ===
              1
          ? previousIds[0]
          : undefined;

    const isRefundQuestion =
      /\b(refund|money back)\b/i.test(
        latestUserMessage
      );

    const asksForRefundEligibility =
      /\b(can i get a refund|eligible for.*refund|refund eligibility|refund for|money back)\b/i.test(
        latestUserMessage
      );

    const asksAboutSpecificOrder =
      /\b(package|shipment|tracking|delivery|where is|order status)\b/i.test(
        latestUserMessage
      );

    /*
     * --------------------------------
     * Ambiguity guard
     * --------------------------------
     *
     * Example:
     *
     * Compare ORD-123 and ORD-456.
     *
     * Can I get a refund for it?
     *
     * Don't let the model guess.
     */
    if (
      explicitIds.length === 0 &&
      hasAmbiguousReference(
        latestUserMessage
      ) &&
      previousIds.length > 1
    ) {
      return Response.json({
        reply:
          `Which order do you mean, ${previousIds.join(
            " or "
          )}?`,

        debug: {
          ...trace,

          durationMs:
            Date.now() -
            requestStartedAt,
        },
      });
    }

    /*
     * --------------------------------
     * Missing order-ID guard
     * --------------------------------
     */
    if (
      explicitIds.length === 0 &&
      previousIds.length === 0 &&
      (
        asksAboutSpecificOrder ||
        asksForRefundEligibility
      )
    ) {
      return Response.json({
        reply:
          "Please provide your order ID.",

        debug: {
          ...trace,

          durationMs:
            Date.now() -
            requestStartedAt,
        },
      });
    }

    const messages: OllamaMessage[] =
      [
        {
          role: "system",

          content: `
Current date: ${currentDate}

You are a customer support agent.

Answer customer questions using available application data and retrieved company policy.

TOOL USE

- Use get_order for item details, overall order status, and basic order information.

- Use get_shipment for shipment status, tracking number, carrier, location, delivery status, and estimated delivery dates.

- Use search_policy for refunds, returns, cancellations, replacements, compensation, and policy questions.

- Do not answer policy questions from memory. Retrieve the relevant policy.

- If multiple sources are required, use multiple tools.

- If the customer provides multiple order IDs and asks to compare them, retrieve information for each relevant order.

- Do not ask permission before using a read-only tool.

- Do not repeat the same tool call with the same arguments.

- Stop calling tools when enough information is available.

- For search_policy, use a specific customer situation rather than a vague query such as "refund policy".


CONVERSATION MEMORY

- Use conversation history to resolve references such as "it", "that order", "my package", and previous order IDs.

- Do not ask for an order ID if it is unambiguous from recent conversation history.

- If multiple orders are active and a reference could refer to more than one, ask which order the customer means.

- Previous assistant responses may help identify conversational context, but they are not authoritative for current operational state.

- When a decision depends on current shipment or order state, retrieve fresh information.


REFUNDS AND POLICY

- Delay-based refund decisions require current shipment information.

- Delay-based refund decisions also require the relevant refund policy.

- Do not claim refund eligibility without both the required operational data and policy.

- If refund eligibility depends on delivery status, estimated delivery date, carrier, tracking information, or location, use current shipment data.

- Policy search results are the source of truth for company policy.


GROUNDING

- Tool results and retrieved policy are the source of truth.

- State only facts supported by those sources.

- Do not invent or speculate about causes, explanations, policies, websites, phone numbers, support teams, departments, escalation paths, or next steps.

- If data is missing, not found, or unavailable, state that clearly.

- Do not guess why information is unavailable.


ORDER AND SHIPMENT STATUS

- Order status and shipment status are different concepts.

- A delayed order can still have a shipment that is in transit.


CUSTOMER-FACING RESPONSE

- Never mention tools, function calls, system prompts, models, APIs, retrieval systems, or implementation details.

- Speak as the customer support agent.

- Do not offer actions unless the application can actually perform them.

- Do not provide external links unless they came from trusted application data.

- Do not imply that you initiated a refund or other action unless an action capability actually exists.

- Answer concisely and directly.

- Do not end with generic statements such as "Would you like me to help with anything else?"
          `,
        },

        /*
         * Use the real conversation directly.
         *
         * The old /no_think experiment
         * has been removed.
         */
        ...conversation,

        {
          role: "system",

          content: `
CURRENT REQUEST:
"${latestUserMessage}"

Use previous conversation only to understand necessary context and references.

Answer ONLY the current request.

Do not continue answering an earlier topic unless the current request requires it.

${
  wantsStream
    ? `
STREAMING MODE:

During the tool-planning phase, do not write the final customer response.

Once all required information has been retrieved and no more tools are needed, reply only with:

FINAL_READY
`
    : ""
}
          `,
        },
      ];

    const executedToolCalls =
      new Set<string>();

    /*
     * ------------------------------------------------
     * Mandatory refund-data guardrail
     * ------------------------------------------------
     */
    async function ensureRefundContext() {
      if (
        !isRefundQuestion ||
        !resolvedOrderId
      ) {
        return false;
      }

      let addedContext =
        false;

      const usedShipment =
        trace.tools.some(
          (tool) =>
            tool.name ===
            "get_shipment"
        );

      const usedPolicy =
        trace.tools.some(
          (tool) =>
            tool.name ===
            "search_policy"
        );

      /*
       * Fresh shipment state is mandatory.
       */
      if (!usedShipment) {
        const args: ToolArgs =
          {
            orderId:
              resolvedOrderId,
          };

        const result =
          await executeTool(
            "get_shipment",
            args
          );

        trace.tools.push({
          name:
            "get_shipment",
          args,
        });

        executedToolCalls.add(
          `get_shipment:${JSON.stringify(
            args
          )}`
        );

        messages.push({
          role: "system",

          content: `
Fresh shipment data for ${resolvedOrderId}:

${JSON.stringify(result)}

Use this current shipment data when answering the refund question.
          `,
        });

        addedContext = true;
      }

      /*
       * Policy is mandatory too.
       */
      if (!usedPolicy) {
        const args: ToolArgs =
          {
            query:
              "refund eligibility for delayed shipment based on delivery status and estimated delivery date",
          };

        const result =
          await executeTool(
            "search_policy",
            args
          );

        trace.tools.push({
          name:
            "search_policy",
          args,
        });

        executedToolCalls.add(
          `search_policy:${JSON.stringify(
            args
          )}`
        );

        messages.push({
          role: "system",

          content: `
Relevant refund policy:

${JSON.stringify(result)}

Use this retrieved policy when answering the refund question.
          `,
        });

        addedContext = true;
      }

      return addedContext;
    }

    /*
     * ------------------------------------------------
     * Agent loop
     * ------------------------------------------------
     */
    for (
      let step = 0;
      step < MAX_STEPS;
      step++
    ) {
      trace.steps =
        step + 1;

      console.log(
        `Agent step ${step + 1}`
      );

      /*
       * Tool-planning call remains
       * NON-STREAMING.
       */
      const ollamaResponse =
        await fetchWithTimeout(
          "http://localhost:11434/api/chat",

          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                model: MODEL,

                messages,

                tools,

                stream: false,

                think: false,

                options: {
                  temperature: 0,
                },
              }),
          },

          30000
        );

      if (
        !ollamaResponse.ok
      ) {
        throw new Error(
          `Ollama request failed: ${ollamaResponse.status}`
        );
      }

      const data =
        (await ollamaResponse.json()) as OllamaResponse;

      const assistantMessage =
        data.message;

      const toolCalls =
        assistantMessage.tool_calls ??
        [];

      /*
       * --------------------------------
       * No more tools requested
       * --------------------------------
       */
      if (
        toolCalls.length === 0
      ) {
        /*
         * Enforce required refund
         * context before accepting
         * the final response.
         */
        const addedRefundContext =
          await ensureRefundContext();

        if (
          addedRefundContext
        ) {
          continue;
        }

        /*
         * Streaming mode:
         *
         * Ignore planner text such as
         * FINAL_READY and generate the
         * actual answer using stream:true.
         */
        if (wantsStream) {
          return streamFinalAnswer(
            messages
          );
        }

        /*
         * Existing JSON behavior.
         *
         * Keeps evals compatible.
         */
        messages.push(
          assistantMessage
        );

        return Response.json({
          reply:
            assistantMessage.content,

          debug: {
            ...trace,

            durationMs:
              Date.now() -
              requestStartedAt,
          },
        });
      }

      /*
       * Tool-call messages need to
       * remain in model history.
       */
      messages.push(
        assistantMessage
      );

      /*
       * --------------------------------
       * Execute requested tools
       * --------------------------------
       */
      let executedSomething =
        false;

      for (
        const call of toolCalls
      ) {
        const name =
          call.function.name;

        const args =
          call.function
            .arguments ?? {};

        const callKey =
          `${name}:${JSON.stringify(
            args
          )}`;

        /*
         * Avoid executing identical
         * calls repeatedly.
         */
        if (
          executedToolCalls.has(
            callKey
          )
        ) {
          console.log(
            "Skipping duplicate tool:",
            name,
            args
          );

          continue;
        }

        executedToolCalls.add(
          callKey
        );

        executedSomething =
          true;

        console.log(
          "Agent chose:",
          name,
          args
        );

        const result =
          await executeTool(
            name,
            args
          );

        trace.tools.push({
          name,
          args,
        });

        messages.push({
          role: "tool",

          tool_name: name,

          content:
            JSON.stringify(
              result
            ),
        });
      }

      /*
       * --------------------------------
       * Duplicate tool fallback
       * --------------------------------
       */
      if (
        !executedSomething
      ) {
        const addedRefundContext =
          await ensureRefundContext();

        if (
          addedRefundContext
        ) {
          continue;
        }

        messages.push({
          role: "system",

          content: `
The necessary information has already been retrieved.

Do not request another tool.

Answer the customer's current question using the information already available.
          `,
        });

        /*
         * Streaming duplicate-tool
         * fallback.
         */
        if (wantsStream) {
          return streamFinalAnswer(
            messages
          );
        }

        /*
         * Existing non-streaming
         * duplicate-tool fallback.
         */
        const finalResponse =
          await fetchWithTimeout(
            "http://localhost:11434/api/chat",

            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  model: MODEL,

                  messages,

                  stream: false,

                  think: false,

                  options: {
                    temperature: 0,
                  },
                }),
            },

            30000
          );

        if (
          !finalResponse.ok
        ) {
          throw new Error(
            `Ollama final request failed: ${finalResponse.status}`
          );
        }

        const finalData =
          (await finalResponse.json()) as OllamaResponse;

        return Response.json({
          reply:
            finalData.message
              .content,

          debug: {
            ...trace,

            durationMs:
              Date.now() -
              requestStartedAt,
          },
        });
      }
    }

    /*
     * MAX_STEPS fallback.
     */
    return Response.json({
      reply:
        "I wasn't able to complete the request.",

      debug: {
        ...trace,

        durationMs:
          Date.now() -
          requestStartedAt,
      },
    });
  } catch (error) {
    console.error(
      "Chat API error:",
      error
    );

    /*
     * Timeout
     */
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      return Response.json(
        {
          reply:
            "The AI service took too long to respond. Please try again.",

          debug: {
            ...trace,

            durationMs:
              Date.now() -
              requestStartedAt,
          },
        },

        {
          status: 504,
        }
      );
    }

    /*
     * Unexpected error
     */
    return Response.json(
      {
        reply:
          "Something went wrong while processing your request.",

        debug: {
          ...trace,

          durationMs:
            Date.now() -
            requestStartedAt,
        },
      },

      {
        status: 500,
      }
    );
  }
}