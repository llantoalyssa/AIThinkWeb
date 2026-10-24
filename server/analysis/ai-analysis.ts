import { htmlToPlainText } from "@/lib/html";
import { IT_FIELDS, coerceFieldOfIt } from "@/lib/constants";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function resolveAnalysisProvider(): "gemini" | "opencode-go" {
  return process.env.GEMINI_API_KEY ? "gemini" : "opencode-go";
}

export function geminiModelId(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export function resolveAnalysisModel(): string {
  return resolveAnalysisProvider() === "gemini"
    ? geminiModelId()
    : process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
}
export function analysisRatePerToken(): { input: number; output: number } {
  if (resolveAnalysisProvider() === "gemini") {
    const m = geminiModelId();

    return m.toLowerCase().includes("pro")
      ? { input: 1.25e-6, output: 10e-6 }
      : { input: 0.30e-6, output: 1.50e-6 };
  }

  return { input: 0.15e-6, output: 0.60e-6 };
}

export type AIVerdict = {
  sdgCategories: string[];
  fieldOfIt: string;
  researchGapAnalysis: string;
  recommendations: {
    titleSuggestions: string[];
    backgroundSuggestions: string[];
  };
  enhancement?: {
    improvedTitle: string;
    improvedBackground: string;
    improvedObjectives: string;
    improvedMethodology: string;
    improvedLiteratureReview: string;
    improvedReferences: string;
    changeSummary: string;
  };
  similarityReduction?: {
    driver: string;
    topMatchTitle: string;
    suggestions: string[];
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

type InternalMatchSummary = {
  title: string;
  similarity: number;
  excerpt?: string;
};

type ExternalMatchSummary = {
  title: string;
  similarity: number;
  snippet?: string;
};
export async function analyzeWithAI(
  tafData: {
    proposedTitle: string;
    background: string;
    objectives: string;
    literatureReview: string;
    methodology: string;
  },
  internalMatches: InternalMatchSummary[],
  externalMatches: ExternalMatchSummary[],
): Promise<AIVerdict> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey && !apiKey) {
    console.warn(
      "[ai-analysis] No API key (GEMINI_API_KEY, DEEPSEEK_API_KEY or OPENAI_API_KEY) — returning fallback",
    );
    return getFallbackVerdict();
  }
  const useGemini = !!geminiKey;
  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://opencode.ai/zen/go/v1";
  const model = resolveAnalysisModel();
  const MAX_TOKENS = 16000;

  type CompletionResult = {
    content: string | null;
    finishReason: string | null;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    } | null;
  };

  const runCompletion = async (
    messages: Array<{ role: "system" | "user"; content: string }>,
  ): Promise<CompletionResult> => {
    if (useGemini) {
      const system = messages.find((m) => m.role === "system");
      const user = messages.find((m) => m.role === "user");
      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: [{ text: user?.content ?? "" }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: MAX_TOKENS,
          responseMimeType: "application/json",
        },
      };
      if (system) {
        body.system_instruction = { parts: [{ text: system.content }] };
      }
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
      const parts: Array<{ text?: string }> =
        data?.candidates?.[0]?.content?.parts || [];
      const content = parts.map((p) => p.text || "").join("").trim() || null;
      const um = data?.usageMetadata || {};
      const promptTokens = um.promptTokenCount || 0;
      const completionTokens = um.candidatesTokenCount || 0;
      return {
        content,
        finishReason: data?.candidates?.[0]?.finishReason || null,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: um.totalTokenCount || promptTokens + completionTokens,
        },
      };
    }
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: apiKey as string,
      baseURL,
      defaultHeaders: {
        "x-opencode-session": "aithink-analysis",
      },
    });
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
    });
    return {
      content: completion.choices[0]?.message?.content ?? null,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : null,
    };
  };
  const pick = (obj: Record<string, unknown>, key: string): unknown =>
    obj[key] ?? obj[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];

  const systemPrompt =
    "You are a research analysis assistant for an IT capstone project system. " +
    "You analyze Thesis Adviser Forms (TAFs) and return structured JSON only. " +
    "Always respond in valid JSON, no markdown. " +
    "LAYOUT OF TEXT INSIDE STRING VALUES: the text is typeset into a thesis " +
    "document, so separate every paragraph with a BLANK LINE, put each list item " +
    "on its own line (numbered \"1. \", \"2. \" for objectives; \"- \" only for " +
    "genuine bulleted lists), and start each reference line with \"[1] \". Never " +
    "return a section as one run-on paragraph and never emit markdown symbols " +
    "(#, **, _, backticks) or HTML tags. " +
    "NEVER SHORTEN THE USER'S CONTENT: every improved* field you return replaces " +
    "the student's original field, so it must be AT LEAST as long and as detailed " +
    "as that original, with every idea, objective, step and reference preserved. " +
    "Expanding and sharpening is your job; deleting or compressing is a failure.";

  try {
    const corePrompt = buildPrompt("core", tafData, internalMatches, externalMatches);
    const coreCondensedPrompt = buildPrompt(
      "core",
      tafData,
      internalMatches.map((m) => ({ ...m, excerpt: undefined })),
      externalMatches.map((m) => ({ ...m, snippet: undefined })),
      true,
    );
    const enhPrompt = buildPrompt("enhancement", tafData, internalMatches, externalMatches);
    const enhCondensedPrompt = buildPrompt(
      "enhancement",
      tafData,
      internalMatches.map((m) => ({ ...m, excerpt: undefined })),
      externalMatches.map((m) => ({ ...m, snippet: undefined })),
      true,
    );
    const runCore = async () => {
      let completion = await runCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: corePrompt },
      ]);
      let text = completion.content;
      if (!text) {
        console.warn(
          `[ai-analysis] Empty core content (finish_reason: ${
            completion.finishReason || "unknown"
          }) — retrying with condensed core prompt`,
        );
        completion = await runCompletion([
          { role: "system", content: systemPrompt },
          { role: "user", content: coreCondensedPrompt },
        ]);
        text = completion.content;
      }
      return { completion, text };
    };

    const runEnh = async () => {
      let completion = await runCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: enhPrompt },
      ]);
      let text = completion.content;
      if (!text) {
        console.warn(
          `[ai-analysis] Empty enhancement content (finish_reason: ${
            completion.finishReason || "unknown"
          }) — retrying with condensed enhancement prompt`,
        );
        completion = await runCompletion([
          { role: "system", content: systemPrompt },
          { role: "user", content: enhCondensedPrompt },
        ]);
        text = completion.content;
      }
      return { completion, text };
    };

    const [coreRes, enhRes] = await Promise.all([runCore(), runEnh()]);
    const coreCompletion = coreRes.completion;
    const coreText = coreRes.text;
    const enhCompletion = enhRes.completion;
    const enhText = enhRes.text;

    let coreParsed: Record<string, unknown> | null = null;
    if (coreText) {
      try {
        coreParsed = JSON.parse(coreText) as Record<string, unknown>;
      } catch (e) {
        console.error("[ai-analysis] Failed to parse core JSON:", e);
      }
    }

    if (!coreParsed) {
      const finishReason = coreCompletion.finishReason;
      return getFallbackVerdict(
        `AI returned an empty/invalid response (finish_reason: ${
          finishReason || "unknown"
        }). The model may have run out of tokens on reasoning — try again.`,
      );
    }

    const sdgCategories = (pick(coreParsed, "sdgCategories") as string[]) || [];
    const fieldOfIt = coerceFieldOfIt(pick(coreParsed, "fieldOfIt") as string);
    const researchGapAnalysis = (pick(coreParsed, "researchGapAnalysis") as string) || "";
    const recs = (pick(coreParsed, "recommendations") as Record<string, unknown>) || {};
    const similarityReduction =
      (pick(coreParsed, "similarityReduction") as Record<string, unknown>) || null;

    if (!researchGapAnalysis || sdgCategories.length === 0) {
      console.warn(
        "[ai-analysis] Core analysis still missing critical fields — keys:",
        Object.keys(coreParsed),
      );
      if (!researchGapAnalysis) {
        console.warn(
          "[ai-analysis] REAL researchGapAnalysis from the model:",
          JSON.stringify(coreParsed, null, 2),
        );
      }
    }

    let enhancement: AIVerdict["enhancement"];
    let usage = coreCompletion.usage;

    if (enhText) {
      try {
        const enh = JSON.parse(enhText) as Record<string, unknown>;
        if (enh && typeof enh.improvedTitle === "string") {
          enhancement = {
            improvedTitle: enh.improvedTitle as string,
            improvedBackground: (enh.improvedBackground as string) || "",
            improvedObjectives: normalizeImprovedObjectives(
              (enh.improvedObjectives as string) || "",
            ),
            improvedMethodology: (enh.improvedMethodology as string) || "",
            improvedLiteratureReview: (enh.improvedLiteratureReview as string) || "",
            improvedReferences: normalizeAcmReferences(
              (enh.improvedReferences as string) || "",
            ),
            changeSummary: (enh.changeSummary as string) || "",
          };
          usage = enhCompletion.usage;
        }
      } catch (enhErr) {
        console.error("[ai-analysis] Failed to parse enhancement JSON:", enhErr);
      }
    }

    return {
      sdgCategories,
      fieldOfIt,
      researchGapAnalysis:
        researchGapAnalysis ||
        "AI could not produce a gap analysis in this run — please try re-analyzing.",
      recommendations: {
        titleSuggestions: (recs.titleSuggestions as string[]) || [],
        backgroundSuggestions: (recs.backgroundSuggestions as string[]) || [],
      },
      enhancement,
      similarityReduction: similarityReduction
        ? {
            driver: (similarityReduction.driver as string) || "",
            topMatchTitle: (similarityReduction.topMatchTitle as string) || "",
            suggestions: (similarityReduction.suggestions as string[]) || [],
          }
        : undefined,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  } catch (err) {
    console.error("[ai-analysis] API error:", err);
    const reason =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return getFallbackVerdict(
      `AI analysis failed: ${reason}. Check the server console for details.`,
    );
  }
}
const GENERAL_OBJECTIVE_RE =
  /(general|primary|overall|main|central|principal|broad)\s+(aim|objective|goal|purpose)/i;
const OBJ_MARKER_RE = /^\(?(\d{1,2})[.)]\s+/;
const OBJ_BULLET_RE = /^[-*•·–—]\s+/;

export function normalizeImprovedObjectives(text: string): string {
  if (!text) return text;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const isItem = (l: string) => OBJ_MARKER_RE.test(l) || OBJ_BULLET_RE.test(l);
  const firstItemIdx = lines.findIndex(isItem);
  if (firstItemIdx < 0) return text;
  let generalIdx = lines.findIndex((l) => GENERAL_OBJECTIVE_RE.test(l));
  if (generalIdx < 0 && firstItemIdx > 0) {
    for (let i = firstItemIdx - 1; i >= 0; i--) {
      if (!isItem(lines[i])) {
        generalIdx = i;
        break;
      }
    }
  }

  const general = generalIdx >= 0 ? lines[generalIdx] : null;
  const specifics = lines
    .filter((_, i) => i !== generalIdx)
    .map((l) => l.replace(OBJ_MARKER_RE, "").replace(OBJ_BULLET_RE, "").trim())
    .filter(Boolean);

  if (specifics.length === 0) return text;

  const strip = (l: string) =>
    l.replace(OBJ_MARKER_RE, "").replace(OBJ_BULLET_RE, "").trim();

  const out: string[] = [];
  if (general) {
    out.push(strip(general));
    out.push("");
  }
  specifics.forEach((s, i) => out.push(`${i + 1}. ${s}`));

  return out.join("\n");
}

function normalizeAcmReferences(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const refs: string[] = [];
  for (const line of lines) {

    let cleaned = line.replace(/^\[?\d+\.?\]?\.?\s*/, "").trim();
    cleaned = cleaned.replace(/^[-*•]\s*/, "").trim();
    if (cleaned) refs.push(cleaned);
  }
  const numberedFragments =
    refs.length === 1 &&
    text.match(/\[\d+\]/) !== null &&
    text.includes("[2]");
  if (numberedFragments) {
    const split = text
      .split(/(?=\[\d+\])/)
      .map((s) => s.replace(/^\[\d+\]\s*/, "").trim())
      .filter(Boolean);
    if (split.length > 1) {
      refs.length = 0;
      refs.push(...split);
    }
  }
  return refs
    .map((r, i) => `[${i + 1}] ${r}`)
    .join("\n");
}
function buildPrompt(
  mode: "core" | "enhancement",
  taf: AIVerdictPrompt["taf"],
  internal: InternalMatchSummary[],
  external: ExternalMatchSummary[],
  condensed = false,
): string {
  const fieldLimit = condensed ? 400 : 900;
  const truncate = (s: string | undefined, label: string): string => {
    const text = htmlToPlainText(s || "");
    if (text.length <= fieldLimit) return text;
    return text.slice(0, fieldLimit) + `… [${label} truncated]`;
  };

  const internalSection =
    internal.length > 0
      ? internal
          .map(
            (m) =>
              `- "${m.title}" (${m.similarity}% similar)${
                m.excerpt && !condensed ? `\n  Excerpt: ${m.excerpt}` : ""
              }`,
          )
          .join("\n")
      : "(none found)";

  const externalSection =
    external.length > 0
      ? external
          .map(
            (m) =>
              `- "${m.title}" (${m.similarity}% similar)${
                m.snippet && !condensed ? `\n  Summary: ${m.snippet}` : ""
              }`,
          )
          .join("\n")
      : "(none found)";

  const settings = `Analyze this student's proposed capstone project and return JSON.

## Student's TAF Data
- Proposed Title: ${truncate(taf.proposedTitle, "title")}
- Background: ${truncate(taf.background, "background")}
- Objectives: ${truncate(taf.objectives, "objectives")}
- Methodology: ${truncate(taf.methodology, "methodology")}
- Literature Review: ${truncate(taf.literatureReview, "literature review")}

## Top Internal Matches (journals in the system's database)
${internalSection}

## Top External Matches (published papers from Google Scholar)
${externalSection}`;

  if (mode === "enhancement") {
    return `${settings}

## Enhancement Task (respond as JSON only)
CITATION RULES — use ACM numbered style:
1. Numbered references [1], [2], [3], ... in the order they are first cited.
2. Insert the bracket number inline at each mention, e.g. "intrusion detection systems [3]".
3. improvedReferences is the numbered list; each entry is a complete ACM-style
   citation (Author(s), Title, Venue/Publisher, Year, DOI/URL if known).
4. EVERY [n] used in the body MUST appear in the references, and vice-versa.

FORMATTING RULES — the returned text is typeset straight into a thesis
document, so its structure matters as much as its wording:
1. Separate paragraphs with a BLANK LINE. Never return a whole section as one
   solid block of text.
2. Objectives: general objective first, then each specific objective on its OWN
   line, numbered "1. ", "2. ", "3. ", ... Never use bullet glyphs for objectives.
   Return EXACTLY this shape (the general objective is a plain sentence, the
   specifics are numbered and start at 1):
     The general objective of this study is to <verb phrase>.
     (blank line)
     1. To <verb phrase>
     2. To <verb phrase>
3. Use "- " bullets only where a bulleted list is genuinely appropriate.
4. References: one entry per line, each starting with its "[n] " marker.
5. Plain prose only — no markdown symbols (#, **, _, backticks), no HTML tags.

PRESERVATION RULES — the improved text REPLACES the student's field, so it must
never lose substance. These apply to EVERY improved* field:
1. NEVER SHORTEN. The improved version must be AT LEAST as long and as detailed
   as the original — keep at least as many sentences and paragraphs. Rewrite and
   EXPAND; never compress a paragraph into a sentence or a single bullet line.
2. PRESERVE EVERY IDEA. Every requirement, dataset, instrument, metric, scope
   element, population and constraint the student stated must survive the
   rewrite. Reword, sharpen and add as much as you like — never delete. If a
   field cannot be improved without removing content, return it generously
   reworded at (or above) its original length rather than shortened.
3. OBJECTIVES: keep the GENERAL objective FIRST as a complete sentence, then
   EVERY specific objective, each on its own numbered line. If the original has
   N objectives, return at least N — never drop the general objective, never
   merge objectives, never reduce the list to one line.
4. Each objective must be a full, self-contained statement (the conventional
   "To <verb> …" form is fine, but never a truncated noun phrase).
{
  "improvedTitle": "string — a refined, improved version of the proposed title that is MORE SPECIFIC and DELIBERATELY DIFFERENTIATED from the matched works, so that re-running similarity against those works would score lower. Keep the core research intent, but add a distinct angle, scope, technology, or context that the matched works do not cover. Do NOT reuse the wording of the matched titles.${condensed ? " Keep it under 250 characters." : ""}",
  "improvedBackground": "string — an enhanced, rewritten version of the background section. CRITICAL: write it in the STUDENT'S OWN FRAMING — a fresh, distinct angle (context, approach, technology, population) that the matched works do not cover. Do NOT copy, echo, or reuse the phrasing of the matched journals/papers (reusing their language INCREASES similarity). Mention gaps in your own words only; cite sources with ACM numbers [n] where relevant, matching the reference list. The rewritten background must be AT LEAST as long as the original, with at least as many paragraphs and every one of the student's points still present.${condensed ? " Keep at least as many paragraphs as the original." : ""}",
  "improvedObjectives": "string — an improved, clearer version of the general and specific objectives, aligned with the enhanced background and focused on the aspects that differentiate this study from the matched works. Write in the student's own framing; do not copy the matched works' objectives or phrasing. Keep the GENERAL objective first as a complete sentence, then EVERY specific objective, each on its own numbered line (\"1. ...\", \"2. ...\", \"3. ...\"). Return AT LEAST as many objectives as the original, with AT LEAST as much detail — never drop the general objective, never merge or shorten one, never use bullet glyphs.${condensed ? " Keep the same number of objectives and the same level of detail as the original." : ""}",
  "improvedMethodology": "string — an improved, clearer version of the methodology. Keep the SAME overall approach the student used, but make it more specific and deliberately differentiated from the matched works (e.g. a sharper data-collection instrument, sampling, evaluation metric, validation or testing procedure) and fully consistent with the enhanced objectives. Write in the student's own framing; do not copy the matched works' methods or phrasing. The rewritten methodology must be AT LEAST as long as the original — keep every step, instrument, dataset and procedure the student described, and add detail rather than condensing.${condensed ? " Keep the same level of detail as the original." : ""}",
  "improvedLiteratureReview": "string — an enhanced review of related literature. Synthesize the topics from the matched works IN YOUR OWN WORDS with a clear gap-focused structure. CRITICAL: paraphrase everything — never copy sentences or phrases from the journal excerpts or paper summaries, since reusing their language increases similarity. End each section by pointing out what the existing works do NOT address. Cite sources ACM-style with bracketed numbers [1]...[n], and ensure every cited number appears in improvedReferences. The review must be AT LEAST as long as the original and cover every topic the student already raised — deepen the synthesis rather than shortening it.${condensed ? " Keep at least as many paragraphs as the original." : ""}",
  "improvedReferences": "string — the ACM NUMBERED reference list. Format: [1] Author(s). Title. Venue/Journal. Year. DOI/URL. Start each entry on a new line as [1] ..., [2] ..., etc. Order matches first-citation order. Include every work cited inline and 5-8 total. NEVER drop a reference that already exists in the student's list — keep and re-number all of them, then add the new ones.${condensed ? " Keep every existing reference plus the most important new ones." : ""}",
  "changeSummary": "string — 2-3 sentences summarizing what was improved compared to the original content and why, including how the revised content differentiates the study from the matched works"
}`;
  }
  return `${settings}

## Analysis Task (respond as JSON only)
{
  "sdgCategories": ["string — list of relevant UN Sustainable Development Goals. Pick 1-3 most relevant, e.g. SDG 4: Quality Education or SDG 9: Industry Innovation and Infrastructure."],
  "fieldOfIt": "string — the primary Field of Information Technology this research supports. Choose EXACTLY ONE of the following nine (return the full field name verbatim, nothing else): ${IT_FIELDS.join(" | ")}",
  "researchGapAnalysis": "string — a detailed research gap analysis of 4-6 sentences (at least 80-120 words). Explain what the existing internal journals and external papers cover, what specific aspects they fail to address, why those gaps matter for the proposed study, and how this study intends to fill them. Be specific and cite the matched works where relevant.${condensed ? " Keep it to 3-4 concise sentences." : ""}",
  "recommendations": {
    "titleSuggestions": ["string — 2-3 alternative or refined proposed titles that are more specific, clear, or differentiated from similar works"],
    "backgroundSuggestions": ["string — 2-3 suggestions for strengthening the background (gaps to highlight, context to add)"]
  },
  "similarityReduction": {
    "driver": "string — 2-3 sentences explaining WHY this TAF still scores high similarity to its top-1 matched work. Identify the specific RESEARCH DIMENSION that overlaps (the technology/platform, the scope, the target population/context, or the methodology approach). Be concrete — name the exact shared element. IMPORTANT: SBERT measures semantic/topic similarity, not word overlap, so rewording alone will NOT lower the score.${condensed ? " Keep it concise." : ""}",
    "topMatchTitle": "string — the title of the single most-similar matched work (the top-1 internal journal or external paper driving the score).",
    "suggestions": ["string — 3-5 CONCRETE, actionable changes the student can make to genuinely LOWER their similarity score. Each suggestion must target a real differentiation lever — e.g. change the technology/platform, narrow or shift the scope, target a different population or context, use a different methodology angle, add a distinct evaluation/outcome, or adopt different core terminology. Each suggestion must be specific to THIS study and THIS top match, not generic advice.${condensed ? " Keep each suggestion to one short sentence." : ""}"]
  }
}`;
}
function getFallbackVerdict(reason?: string): AIVerdict {
  return {
    sdgCategories: ["SDG 9: Industry, Innovation and Infrastructure"],
    fieldOfIt: IT_FIELDS[0],
    researchGapAnalysis:
      reason ||
      "Set GEMINI_API_KEY (or DEEPSEEK_API_KEY / OPENAI_API_KEY) env variable to enable AI-powered gap analysis.",
    recommendations: {
      titleSuggestions: [],
      backgroundSuggestions: [],
    },
  };
}
type AIVerdictPrompt = {
  taf: {
    proposedTitle: string;
    background: string;
    objectives: string;
    literatureReview: string;
    methodology: string;
  };
};