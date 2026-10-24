"use server";
export type JournalMetadata = {
  title: string;
  authors: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

const MAX_TEXT_LENGTH = 4_000;
const MAX_TOKENS = 16_000;
export async function extractJournalMetadata(
  text: string
): Promise<{ success: true; data: JournalMetadata } | { success: false; error: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "No API key configured (DEEPSEEK_API_KEY). Please set it in your environment.",
    };
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://opencode.ai/zen/go/v1";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
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
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        "x-opencode-session": "aithink-journal-extract",
      },
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You extract metadata from academic papers. Respond in valid JSON only, no markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
    });
    const msg = completion.choices[0]?.message as any;
    const raw = msg?.content || msg?.reasoning_content || "";
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