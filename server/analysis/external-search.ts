// ============================================================
// Google Scholar search via SerpAPI
// Returns structured paper results for external similarity
// ============================================================

export type ScholarResult = {
  title: string;
  authors: string;
  publication: string;  // e.g. "IEEE Conference on Computer Vision, 2024"
  year: number | null;
  summary: string;      // snippet / abstract
  link: string;
};

export type ExternalSearchResult = {
  success: true;
  results: ScholarResult[];
} | {
  success: false;
  error: string;
  results?: never;
};

/**
 * Search Google Scholar for papers matching the given query.
 * Requires SERPAPI_API_KEY env variable.
 * Free tier: 100 searches/month.
 */
export async function searchGoogleScholar(
  query: string,
  numResults: number = 10,
): Promise<ExternalSearchResult> {
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    console.warn("[external-search] SERPAPI_API_KEY not set — returning empty results");
    return {
      success: true,
      results: [],
    };
  }

  try {
    // Dynamic import so it doesn't fail at module level when key is missing
    const { getJson } = await import("serpapi");

    const response = await getJson({
      api_key: apiKey,
      engine: "google_scholar",
      q: query.slice(0, 500),   // keep query reasonable
      num: Math.min(numResults, 20),
      hl: "en",
    });

    const raw = response as Record<string, unknown>;

    // SerpAPI v2 returns errors in the response body for some failures.
    // BUT two of those messages are actually LEGITIMATE empty results,
    // not failures:
    //   - "Google hasn't returned any results for this query."
    //   - any "no results" / "No results" phrasing
    // A niche / original thesis topic often returns zero Scholar hits;
    // that is a valid "no external matches" outcome, not an API error.
    // So we treat it as a successful empty search instead of failing the
    // whole external leg (which would otherwise zero the external score).
    if (raw.error) {
      const errMsg = String(raw.error);
      const isNoResults =
        /hasn'?t returned any results|no results|nothing found|did not match any/i.test(
          errMsg,
        );
      if (isNoResults) {
        console.warn(
          "[external-search] Scholar returned no results for query (treated as empty):",
          errMsg,
        );
        return { success: true, results: [] };
      }
      console.error("[external-search] SerpAPI response error:", errMsg);
      return { success: false, error: errMsg };
    }

    if (!raw.organic_results || !Array.isArray(raw.organic_results)) {
      return {
        success: true,
        results: [],
      };
    }

    const results: ScholarResult[] = raw.organic_results
      .slice(0, numResults)
      .map((item: Record<string, unknown>) => {
        const pubInfo = item.publication_info as Record<string, unknown> | undefined;
        const authorsArr = (pubInfo?.authors as Array<Record<string, string>>) || [];
        const summary = (pubInfo?.summary as string) || "";

        // Extract year from summary e.g. "IEEE Conf, 2023" or "Journal of AI, 2024"
        const yearMatch = summary.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;

        return {
          title: (item.title as string) || "",
          authors: authorsArr
            .map((a) => a.name as string)
            .join(", "),
          publication: summary,
          year,
          summary,
          link: (item.link as string) || "",
        };
      })
      .filter((r: ScholarResult) => r.title); // remove empty titles

    return { success: true, results };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? (err as Record<string, unknown>).error
            ? String((err as Record<string, unknown>).error)
            : JSON.stringify(err)
          : "Unknown error";
    console.error("[external-search] SerpAPI error:", message);
    return { success: false, error: message };
  }
}
