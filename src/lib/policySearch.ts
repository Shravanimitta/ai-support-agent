import fs from "fs/promises";
import path from "path";

const OLLAMA_EMBED_URL = "http://localhost:11434/api/embed";
const EMBEDDING_MODEL = "nomic-embed-text";

type PolicyChunk = {
  source: string;
  text: string;
};

type IndexedPolicyChunk = PolicyChunk & {
  embedding: number[];
};

let policyIndexPromise: Promise<IndexedPolicyChunk[]> | null = null;

async function embedTexts(texts: string[]) {
  const response = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate embeddings");
  }

  const data = await response.json();

  return data.embeddings as number[][];
}

async function loadPolicyChunks(): Promise<PolicyChunk[]> {
  const policyDir = path.join(
    process.cwd(),
    "src",
    "data",
    "policies"
  );

  const files = await fs.readdir(policyDir);

  const chunks: PolicyChunk[] = [];

  for (const file of files) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const fullPath = path.join(policyDir, file);
    const content = await fs.readFile(fullPath, "utf-8");

    // For now, each paragraph becomes a chunk.
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((text) => text.trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      chunks.push({
        source: file,
        text: paragraph,
      });
    }
  }

  return chunks;
}

async function buildPolicyIndex() {
  console.log("Building policy embedding index...");

  const chunks = await loadPolicyChunks();

  const embeddings = await embedTexts(
    chunks.map((chunk) => chunk.text)
  );

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));
}

async function getPolicyIndex() {
  if (!policyIndexPromise) {
    policyIndexPromise = buildPolicyIndex();
  }

  return policyIndexPromise;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  return (
    dotProduct /
    (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
  );
}

export async function searchPolicies(
  query: string,
  limit = 3
) {
  const index = await getPolicyIndex();

  const [queryEmbedding] = await embedTexts([query]);

  const results = index
    .map((chunk) => ({
      source: chunk.source,
      text: chunk.text,
      score: cosineSimilarity(
        queryEmbedding,
        chunk.embedding
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}