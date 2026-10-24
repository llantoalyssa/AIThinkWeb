import type { FeatureExtractionPipeline } from "@xenova/transformers";
export type SimilarityItem = {
  id: string;
  text: string;

  meta?: Record<string, unknown>;
};

export type SimilarityResult = {
  id: string;
  similarity: number;
  meta?: Record<string, unknown>;
};
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {

    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    ) as Promise<FeatureExtractionPipeline>;
  }
  return pipelinePromise;
}
async function embed(
  pipe: FeatureExtractionPipeline,
  text: string,
): Promise<number[]> {

  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8_000);
  const result = await pipe(cleaned, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(result.data) as number[];
}
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
export async function findTopSimilar(
  queryText: string,
  candidates: SimilarityItem[],
  topN: number = 5,
  threshold: number = 0,
): Promise<SimilarityResult[]> {
  if (candidates.length === 0) return [];
  if (!queryText.trim()) return [];

  const pipe = await getPipeline();
  const queryVec = await embed(pipe, queryText);
  const candidateTexts = candidates.map((c) => c.text);
  const result = await pipe(candidateTexts, {
    pooling: "mean",
    normalize: true,
  });
  const data = result.data as Float32Array;
  const dims = result.dims;
  const embeddingDim = dims[1];
  const batchSize = dims[0];
  const scored: { id: string; similarity: number; meta?: Record<string, unknown> }[] = [];
  for (let i = 0; i < batchSize; i++) {
    const vec = Array.from(
      data.subarray(i * embeddingDim, (i + 1) * embeddingDim),
    ) as number[];
    const sim = cosineSimilarity(queryVec, vec);
    const pct = Math.round(sim * 10000) / 100;
    if (pct >= threshold) {
      scored.push({ id: candidates[i].id, similarity: pct, meta: candidates[i].meta });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}
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