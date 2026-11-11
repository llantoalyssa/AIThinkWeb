import type { FeatureExtractionPipeline } from "@xenova/transformers";

// ── Types ──────────────────────────────────────────────────

export type SimilarityItem = {
  id: string;
  text: string;
  meta?: Record<string, unknown>;
};

export type SimilarityResult = {
  id: string;
  similarity: number; // 0–100 (percentage)
  meta?: Record<string, unknown>;
};

// ── Singleton pipeline ─────────────────────────────────────

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    // Dynamic import so it doesn't block initial module load
    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2", // 384-dim, fast, good accuracy
    ) as Promise<FeatureExtractionPipeline>;
  }
  return pipelinePromise;
}

// ── Embed a single text into a vector ──────────────────────

async function embed(
  pipe: FeatureExtractionPipeline,
  text: string,
): Promise<number[]> {
  // Truncate to ~512 tokens to stay within model limits
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8_000);
  const result = await pipe(cleaned, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(result.data) as number[];
}

// ── Cosine similarity between two vectors ──────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Vectors are already L2-normalized by the model,
  // so dot product = cosine similarity
  return dot;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Given a query text and a list of candidate texts, return the
 * top N candidates sorted by cosine similarity.
 *
 * @param queryText  The text to compare against (e.g. student's TAF)
 * @param candidates Array of { id, text, meta? } to rank
 * @param topN       Number of results to return (default 5)
 * @param threshold  Minimum similarity to include (0–100, default 0)
 */
export async function findTopSimilar(
  queryText: string,
  candidates: SimilarityItem[],
  topN: number = 5,
  threshold: number = 0,
): Promise<SimilarityResult[]> {
  if (candidates.length === 0) return [];
  if (!queryText.trim()) return [];

  const pipe = await getPipeline();

  // 1. Encode query
  const queryVec = await embed(pipe, queryText);

  // 2. Encode all candidates (batch is more efficient)
  const candidateTexts = candidates.map((c) => c.text);
  const result = await pipe(candidateTexts, {
    pooling: "mean",
    normalize: true,
  });

  // result.data is a flat Float32Array shaped [N, 384]
  const data = result.data as Float32Array;
  const dims = result.dims; // [batch_size, embedding_dim]
  const embeddingDim = dims[1];
  const batchSize = dims[0];

  // 3. Compute similarities
  const scored: { id: string; similarity: number; meta?: Record<string, unknown> }[] = [];
  for (let i = 0; i < batchSize; i++) {
    const vec = Array.from(
      data.subarray(i * embeddingDim, (i + 1) * embeddingDim),
    ) as number[];
    const sim = cosineSimilarity(queryVec, vec);
    const pct = Math.round(sim * 10000) / 100; // 0.8723 → 87.23
    if (pct >= threshold) {
      scored.push({ id: candidates[i].id, similarity: pct, meta: candidates[i].meta });
    }
  }

  // 4. Sort descending and take top N
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

/**
 * Compute similarity between exactly two texts.
 */
export async function computePairSimilarity(
  textA: string,
  textB: string,
): Promise<number> {
  const pipe = await getPipeline();
  const [vecA, vecB] = await Promise.all([embed(pipe, textA), embed(pipe, textB)]);
  return Math.round(cosineSimilarity(vecA, vecB) * 10000) / 100;
}


export async function embedText(text: string): Promise<number[]> {
  if (!text.trim()) {
    throw new Error("Cannot embed empty text.");
  }
  const pipe = await getPipeline();
  return embed(pipe, text);
}

export async function findTopSimilarByVector(
  queryVec: number[],
  candidates: { id: string; vector: number[]; meta?: Record<string, unknown> }[],
  topN: number = 5,
  threshold: number = 0,
): Promise<SimilarityResult[]> {
  if (candidates.length === 0) return [];

  const scored: { id: string; similarity: number; meta?: Record<string, unknown> }[] = [];
  for (const c of candidates) {
    if (!c.vector || c.vector.length === 0) continue;
    const sim = cosineSimilarity(queryVec, c.vector);
    const pct = Math.round(sim * 10000) / 100;
    if (pct >= threshold) {
      scored.push({ id: c.id, similarity: pct, meta: c.meta });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}
