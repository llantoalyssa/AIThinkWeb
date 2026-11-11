# Environment Setup Requirements

To run this project locally, you must create a `.env.local` file in the project root with the following variables:

```bash
# ── Supabase (required) ────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# ── TAF Analysis (add these for Analyze TAF feature) ───
DEEPSEEK_API_KEY=your-api-key
# DeepSeek (or any OpenAI-compatible) API key
# Get from: https://platform.deepseek.com/api_keys
# or use OPENAI_API_KEY if you prefer OpenAI directly
#
# Optional overrides:
# DEEPSEEK_BASE_URL=https://api.deepseek.com   # default
# DEEPSEEK_MODEL=deepseek-chat                 # default (v4 flash)
#
# Used for: SDG classification, Field of IT, Research Gap Analysis,
#           Recommendations for Improvement

SERPAPI_API_KEY=your-serpapi-api-key
# Get from: https://serpapi.com/manage-api-key
# Free tier: 100 searches/month (plenty for testing)
# Used for: Google Scholar external similarity search
```

You can find the Supabase values in your Supabase project dashboard under Settings > API.

**Note**: The Analyze TAF feature will still work (with fallback values) if OPENAI_API_KEY or SERPAPI_API_KEY are missing — the SBERT internal similarity engine runs 100% locally with no API key needed.

Do NOT commit this file to version control.
