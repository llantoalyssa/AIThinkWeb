"use server";

import {
  geminiModelId,
  resolveAnalysisModel,
  resolveAnalysisProvider,
} from "./ai-analysis";

export type JournalMetadata = {
  title: string;
  authors: string[];
  /** Which provider answered, and the exact model id. */
  provider?: "gemini" | "opencode-go";
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

const MAX_TEXT_LENGTH = 4_000; 
const MAX_TOKENS = 16_000;

const SYSTEM_PROMPT =
  "You extract metadata from academic papers. Respond in valid JSON only, no markdown.";

type RawCompletion = {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
};

/**
 * Extract title and authors from journal text using AI.
 * Returns extracted metadata + the provider/model/token usage for cost tracking.
 */
export async function extractJournalMetadata(
  text: string
): Promise<{ success: true; data: JournalMetadata } | { success: false; error: string }> {
  const provider = resolveAnalysisProvider();
  const model = resolveAnalysisModel();
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

  if (provider === "gemini" ? !geminiKey : !apiKey) {
    return {
      success: false,
      error:
        provider === "gemini"
          ? "GEMINI_API_KEY is not configured. Please set it in your environment."
          : "No API key configured (DEEPSEEK_API_KEY). Please set it in your environment.",
    };
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://opencode.ai/zen/go/v1";

  const truncated = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);

  const prompt = `Extract the exact title and all authors from this academic paper. Respond with valid JSON only.

Instructions:
- "title": The full paper title exactly as it appears in the document
- "authors": An array of author full names. Look near the title or abstract for author names. Common patterns: "Author One, Author Two, Author Three" or "Author1, A.1, Author2, B.2"
- If authors are listed with affiliations or emails, strip those out — keep only the names

Document text (first portion):
"""
${truncated}
"""

Respond with ONLY this JSON:
{
  "title": "extracted title here",
  "authors": ["First Author", "Second Author"]
}`;

  try {
    const completion = await runCompletion({
      provider,
      model,
      apiKey,
      geminiKey,
      baseURL,
      prompt,
    });

    const raw = completion.content;
    if (!raw) {
      return { success: false, error: "AI returned empty response." };
    }

    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return { success: false, error: "AI returned invalid JSON." };
    }
    const jsonText = cleaned.slice(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonText) as { title?: string; authors?: string[] };

    return {
      success: true,
      data: {
        title: parsed.title?.trim() || "Untitled",
        authors: Array.isArray(parsed.authors) ? parsed.authors.filter(Boolean) : [],
        provider,
        model,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      },
    };
  } catch (err) {
    console.error("[extractJournalMetadata] API error:", err);
    return { success: false, error: "AI extraction failed. Please try again." };
  }
}

async function runCompletion({
  provider,
  model,
  apiKey,
  geminiKey,
  baseURL,
  prompt,
}: {
  provider: "gemini" | "opencode-go";
  model: string;
  apiKey?: string;
  geminiKey?: string;
  baseURL: string;
  prompt: string;
}): Promise<RawCompletion> {
  if (provider === "gemini") {
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: MAX_TOKENS,
        responseMimeType: "application/json",
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      geminiModelId(),
    )}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }

    const data = await res.json();
    const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts || [];
    const usageMetadata = data?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;

    return {
      content: parts.map((p) => p.text || "").join("").trim(),
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens:
          usageMetadata.totalTokenCount || promptTokens + completionTokens,
      },
    };
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: apiKey as string,
    baseURL,
    defaultHeaders: {
      "x-opencode-session": "aithink-journal-extract",
    },
  });

  const result = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    response_format: { type: "json_object" },
  });

  const msg = result.choices[0]?.message as
    | { content?: string | null; reasoning_content?: string | null }
    | undefined;

  return {
    content: (msg?.content || msg?.reasoning_content || "").trim(),
    usage: result.usage
      ? {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
        }
      : null,
  };
}
