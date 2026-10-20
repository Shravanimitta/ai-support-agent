import { evalCases } from "../src/evals/evalCases";

type ActualToolCall = {
  name: string;
  args: Record<string, string>;
};

type DebugInfo = {
  steps: number;
  tools: ActualToolCall[];
  durationMs: number;
};

type ChatResponse = {
  reply: string;
  debug?: DebugInfo;
};

function toolMatches(
  expected: {
    name: string;
    args?: Record<string, string>;
  },
  actual: ActualToolCall
) {
  if (expected.name !== actual.name) {
    return false;
  }

  if (!expected.args) {
    return true;
  }

  return Object.entries(expected.args).every(
    ([key, value]) => actual.args?.[key] === value
  );
}

async function run() {
  let passed = 0;
  let toolPassed = 0;
  let answerPassed = 0;

  let totalDuration = 0;
  let totalSteps = 0;
  let totalExtraToolCalls = 0;

  for (const test of evalCases) {
    const response = await fetch(
      "http://127.0.0.1:3000/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: test.messages,
        }),
      }
    );

    const data = (await response.json()) as ChatResponse;

    const actualTools = data.debug?.tools ?? [];
    const reply = data.reply.toLowerCase();

    // -----------------------------
    // Tool evaluation
    // -----------------------------

    const expectedMatched = test.expectedTools.every(
      (expected: {
        name: string;
        args?: Record<string, string>;
      }) =>
        actualTools.some((actual) =>
          toolMatches(expected, actual)
        )
    );

    // -----------------------------
    // Answer evaluation
    // -----------------------------

    const includesExpected =
      test.mustInclude?.every((text) =>
        reply.includes(text.toLowerCase())
      ) ?? true;

    const avoidsForbidden =
      test.mustNotInclude?.every(
        (text) =>
          !reply.includes(text.toLowerCase())
      ) ?? true;

    const answerCorrect =
      includesExpected && avoidsForbidden;

    // -----------------------------
    // Overall result
    // -----------------------------

    const success =
      expectedMatched && answerCorrect;

    const extraToolCalls = Math.max(
      0,
      actualTools.length -
        test.expectedTools.length
    );

    // -----------------------------
    // Track totals
    // -----------------------------

    if (expectedMatched) {
      toolPassed++;
    }

    if (answerCorrect) {
      answerPassed++;
    }

    if (success) {
      passed++;
    }

    totalSteps += data.debug?.steps ?? 0;
    totalDuration +=
      data.debug?.durationMs ?? 0;

    totalExtraToolCalls += extraToolCalls;

    // -----------------------------
    // Individual test output
    // -----------------------------

    console.log(
      success ? "✅ PASS" : "❌ FAIL",
      "-",
      test.name
    );

    console.log(
      "  expected tools:",
      test.expectedTools
    );

    console.log(
      "  actual tools:  ",
      actualTools
    );

    console.log(
      "  steps:         ",
      data.debug?.steps
    );

    console.log(
      "  time:          ",
      `${data.debug?.durationMs ?? 0} ms`
    );

    console.log(
      "  extra tools:   ",
      extraToolCalls
    );

    if (!expectedMatched) {
      console.log(
        "  ❌ required tool call missing"
      );
    }

    if (!includesExpected) {
      console.log(
        "  ❌ missing expected answer content:",
        test.mustInclude
      );
    }

    if (!avoidsForbidden) {
      console.log(
        "  ❌ contains forbidden content:",
        test.mustNotInclude
      );
    }

    if (
      success &&
      extraToolCalls > 0
    ) {
      console.log(
        "  ⚠️ correct, but used unnecessary tool calls"
      );
    }

    if (!success) {
      console.log(
        "  reply:",
        data.reply
      );
    }

    console.log();
  }

  // -----------------------------
  // Final scorecard
  // -----------------------------

  console.log(
    "=========================="
  );

  console.log(
    "       EVAL SCORECARD"
  );

  console.log(
    "=========================="
  );

  console.log(
    `Overall: ${passed}/${evalCases.length}`
  );

  console.log(
    `Tool routing: ${toolPassed}/${evalCases.length}`
  );

  console.log(
    `Answer quality: ${answerPassed}/${evalCases.length}`
  );

  console.log(
    `Accuracy: ${Math.round(
      (passed / evalCases.length) * 100
    )}%`
  );

  console.log(
    `Average steps: ${(
      totalSteps / evalCases.length
    ).toFixed(1)}`
  );

  console.log(
    `Average latency: ${Math.round(
      totalDuration / evalCases.length
    )} ms`
  );

  console.log(
    `Extra tool calls: ${totalExtraToolCalls}`
  );

  console.log(
    "=========================="
  );
}

run().catch(console.error);