# AI-THINK — System Architecture

A platform that helps students prepare and submit their capstone proposals (TAFs) through an approval workflow: **student → adviser → associate dean → dean → VCRDES**. It compares proposals with department journals and Google Scholar results, and provides research-gap analysis and writing suggestions.

This document covers the app structure, main features, and how proposal analysis and scoring work.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Next.js 15 (App Router)                        │
│                                                                     │
│  Browser (React 19)  ⇄  Server Actions (RSC)  ⇄  Server Components │
└───────────────────────────┬─────────────────────────────┬─_─────────┘
                            │                             │
                ┌───────────▼───────────┐      ┌──────────▼───────────┐
                │      Supabase         │      │      External APIs   │
                │  Postgres + pgvector  │      │  • Gemini            │
                │ Storage (PDF bucket)  │      │  • SerpAPI (Scholar) │
                │                       │      └───────────▲──────────┘
                └───────────▲───────────┘                 │
                            │                             │
              ┌─────────────▼─────────────┐               │
              │   Local inference (SBERT) │               │
              │   @xenova/transformers    │   (free, on   │
              │   all-MiniLM-L6-v2 (384d) │    server CPU)│
              └───────────────────────────┘               │
                                                          │
                    Search queries ───────────────────────┘
```

- The frontend and backend run in one Next.js app. Server Actions run on the server, check user access, and call Supabase and external services.
- Supabase provides the Postgres database and Row-Level Security (RLS).
- Similarity uses a local SBERT model. Proposal analysis and writing suggestions use the Google Gemini API. Google Scholar search is provided through SerpAPI.

---

## 2. Tech Stack & Packages

### Core framework

| Package                                                    | What it's used for                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| **Next.js 15** (`next`)                                    | App Router, React Server Components, Server Actions, routing, build |
| **React 19** (`react`, `react-dom`)                        | UI rendering                                                        |
| **TypeScript** (`typescript`)                              | Static typing throughout                                            |
| **Tailwind CSS 4** (`tailwindcss`, `@tailwindcss/postcss`) | Styling/design system                                               |

### UI / components

| Package                                                | What it's used for                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **shadcn/ui** (`shadcn`) + `radix-ui` / `@radix-ui/*`  | Headless, accessible UI primitives (dialogs, dropdowns, selects) that the app's custom cards/buttons/tables are built on |
| **lucide-react**                                       | Icon set                                                                                                                 |
| **class-variance-authority**, `clsx`, `tailwind-merge` | Styling utilities for composable component variants                                                                      |
| **sonner**                                             | Toast notifications (e.g. "TAF approved", "Message sent")                                                                |
| **tw-animate-css**                                     | CSS animations                                                                                                           |

### Rich text editor

| Package       | Use                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **TipTap v3** | Rich-text editing for TAF titles, background, objectives, literature review, methodology, and references |
| `lib/html.ts` | Converts rich text to plain text for analysis and converts generated text back to editor HTML            |

### Data / backend

| Package                                                 | Use                                             |
| ------------------------------------------------------- | ----------------------------------------------- |
| **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) | Database, authentication, RLS, and file storage |
| **pgvector**                                            | Stores 384-number journal vectors in Postgres   |

### Text comparison and analysis

| Package                  | Use                                                                |
| ------------------------ | ------------------------------------------------------------------ |
| **@xenova/transformers** | Runs SBERT locally in Node.js to compare proposal and journal text |
| **pdfjs-dist**           | Extracts text from uploaded journal PDFs                           |

The app calls the **Google Gemini API** for proposal analysis and writing suggestions. It uses the `GEMINI_API_KEY` environment variable.

### External search

| Package     | What it's used for                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **serpapi** | Google Scholar search API. Each analysis issues a Scholar keyword query (~$0.01/call) to find published papers similar to the student's proposal. |

---

## 3. Environment Variables (`.env.local`)

| Variable                        | Purpose                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS enforces real access)                                                     |
| `GEMINI_API_KEY`                | API key used to access Google Gemini for AI-assisted analysis and TAF improvement suggestions. |
| `SERPAPI_API_KEY`               | API key used to retrieve external academic studies from Google Scholar.                        |

> **Note:** Next.js reads `.env.local` **only at server start**. After changing env keys, restart `npm run dev`.

---

## 4. Roles, Auth & Security

### Registering & logging in

- **Registration** is restricted to `@g.batstate-u.edu.ph` email domain.
- Users log in with email/password via Supabase Auth. The app mirrors the user's **role** and **active status** into the `profiles` table.
- **`profiles.is_active`** gates login. An account can be **disabled** by the department admin, and the user is blocked with _"Your account has been disabled"_ on `/login?disabled=1`.

### The 6 roles

| Role             | Route                       | Can do                                                                                                                    |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `student`        | `/dashboard/student`        | Create and analyze TAFs, join advisory groups, submit TAFs, and communicate with advisers and evaluators through comments |
| `adviser`        | `/dashboard/adviser`        | Own advisory groups, review submitted TAFs, **approve+route** or **return**                                               |
| `associate_dean` | `/dashboard/associate-dean` | Review/approve/return TAFs routed to them                                                                                 |
| `dean`           | `/dashboard/dean`           | Review/approve/return TAFs routed to them                                                                                 |
| `department`     | `/dashboard/department`     | **Manage users** (enable/disable) and **upload journals** into the comparison database                                    |
| `vcrdes`         | `/dashboard/vcrdes`         | Final approver in the chain                                                                                               |

- **Single active account per approver role:** only **one** active `associate_dean`, one `dean`, and one `vcrdes` at a time (enforced in the database, server, and UI). These accounts receive the routed TAFs.

### Defense-in-depth

Access is checked at three levels: database RLS policies, server-action role and ownership checks, and UI controls shown only to allowed users.

---

## 5. Domain Models (Key Tables)

| Table                       | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `profiles`                  | User role, account status, and profile details                                                       |
| `advisory_groups`           | Student groups and their adviser                                                                     |
| `student_group_memberships` | Links students to groups                                                                             |
| `topic_abstract_forms`      | TAF content, including title, background, objectives, literature review, methodology, and references |
| `taf_analysis_results`      | Scores, matches, analysis results, and suggested edits for each run                                  |
| `journals`                  | Uploaded PDFs, extracted text, and comparison vectors                                                |
| `group_taf_submissions`     | Approval status, current approver, and decisions                                                     |
| `submission_chat_messages`  | Older free-text chat; replaced by annotations                                                        |
| `submission_annotations`    | Comments anchored to TAF sections, with replies and resolution status                                |
| `approval_notifications`    | Notices when a TAF is routed, returned, resubmitted, or approved                                     |
| `analysis_cost_logs`        | Gemini and search usage, costs, and title snapshot                                                   |

---

## 6. The TAF Lifecycle

```
Student creates TAF (rich-text fields)
        │
        ▼
Student submits to an advisory group
   (must be analyzed first; always starts routed to the adviser)
        │
        ▼
ADVISER  ───────────── approve ─────►  ASSOC. DEAN ──► DEAN ──► VCRDES
   │                                  (fixed order)                │
   └─ return ─────────────────────────────────────────┐         │
                                                      ▼         ▼
                                                  fully approved
        ▲                                                   (VCRDES = final)
        │                      Student edits & resubmits
        └──── RETURNED ─────────────────────────────────────────┘
```

### Approval routing

Fixed cycle — **no adviser route picker**:

- **New submission** → always `current_approver_role = 'adviser'`.
- **Adviser approves** → routes to **Associate Dean** → **Dean** → **VCRDES** in that fixed order (`approval_route` is set to the full chain on adviser approval, so the tracker + comment gate follow it).
- **VCRDES** approving = **fully approved** (`fully_approved_at` set).
- **Any approver returns** → TAF goes back to the **student** (`status = 'revisions_needed'`). The student edits (inline on the submission page via `SubmittedTafEditor`, or in the draft) and **resubmits** → back to the adviser, statuses reset for the new round.
- **Notifications** fire on route/return/resubmit/fully-approved to the right party.
- The adviser's Approve button is a plain **Approve** (no route-selection dialog); `approveSubmission` computes the next role from the fixed chain.
- **Writes bypass RLS via a SECURITY DEFINER function.** The approve/return/resubmit state transitions on `group_taf_submissions` go through `public.apply_taf_workflow_update(submission_id, updates_jsonb)` (migration 024). This avoids the "new row violates row-level security policy" (42501) bug caused by conflicting RLS UPDATE `WITH CHECK` policies on that table. Authorization (who may act, which stage) is still enforced in the server actions _before_ calling the function; the function only performs the UPDATE with owner privileges. RLS stays enabled for reads.

### Approver dashboards

Associate Dean / Dean / VCRDES each get a dashboard with:

- **Research Analytics** (default landing tab), **TAF Submissions** (pending approvals table — Advisory Group, Proposed Title, Similarity, Date, Status; **rows click through** to the submission review page), and **Approved TAF** (searchable + academic-year filter).
- **Research Analytics** aggregates **fully-approved TAFs** into: Most/Least Referenced capstones (by internal-match count), SDG + Field-of-IT bar graphs, Top/Bottom similarity, a KPI strip, and per-year filtering; SDG/FoIT dialogs expand to a searchable approved-TAF table with PDF export.
- The submission review page shows the **exact same layout** for every approver and the adviser (shared `SubmissionReviewContent`), with role-specific Approve/Return buttons.

### Comment panel (annotations)

The submitted-TAF **comment panel** replaces the old free-text chat. It's a **Google-Docs-style** annotation system:

- Participants can **select text** in the submitted TAF and **Add comment** — a collapsible right-side panel lists comment **threads**, grouped by section, with threaded **replies** and **resolve/reopen**.
- **Snippets are anchored, not offset-based**: the highlighted text + section (`field_key`) are stored; on each view the matching snippets render with an **amber highlight + count badge**.
- Clicking a comment thread **scrolls to and "pulses"** the exact highlighted snippet in the document.
- **Who can view vs comment:** the **submitter** and **approvers** (adviser + associate dean/dean/vcrdes once routed) can **comment** and see every thread (mutually visible). **Group-member students** (not the submitter) get a **read-only** view — they can see all threads live, but cannot add/reply/resolve/edit/delete. This is enforced server-side (`accessibleRoles()` returns `canComment`) **and** by RLS.
- **Routing gate is identical to chat/approvals**: the adviser can comment from the start; associate dean / dean / vcrdes can only see & comment once the TAF has been **routed to them** (or is fully approved). The student sees all counterparty threads. Each thread is scoped by `with_role`.
- Uses `submission_annotations` table + `AnnotationLayer` / `AnnotationPanel` / `AnnotatedSection` components. Visibility is enforced server-side (`accessibleRoles()`) plus RLS.

---

## 7. ⭐ The Analysis Logic (the heart of the system)

`server/actions/analyze-taf.ts` orchestrates a full analysis of a student's TAF. Each run produces a **version** (V1, V2, … up to V5). Here is a step-by-step of exactly what happens:

```
  Load TAF fields
       │
       ▼
  Build comparison text  (title + background + objectives + methodology + RRL,
  1                        HTML stripped → plain text)
       │
       ├───────────────────────────────┐ (run in PARALLEL for speed)
       ▼                               ▼
  2  INTERNAL SIMILARITY         4  EXTERNAL SEARCH ──► Google Scholar (SerpAPI)
     vs department journals          │   (NLP on the title → keywords)
     (pre-computed SBERT vectors)    ▼
       │                         5  EXTERNAL SIMILARITY
       │  embed TAF text once        │   re-embed Scholar titles/summaries
       │  (all-MiniLM-L6-v2)        │   on the fly, cosine vs TAF text
       │  cosine vs every journal   │   → top 5
       │  → top 5 internal matches  │
       ▼                            ▼
  3  Stage-2 aspect rescore of each side's Top 5 candidates
       │  strip boilerplate; compare objectives, subject, methodology, full text
       │  apply corpus-specific noise floors, then weak-topic gates
       │  rank-weight the final per-match scores (renormalize when fewer than 5)
       ▼
  6  COMBINED SCORE  =  (internal aggregate × 0.40) + (external aggregate × 0.60)
       │
       ▼
  7  AI ANALYSIS (configured Gemini / OpenCode Go-compatible provider)
       │     classifies SDG categories + field of IT
       │     writes a research-gap analysis (cites matched works)
       │     generates an ENHANCEMENT: improved title/background/
       │       objectives/RRL/references + change summary
       ▼
  8  Store the analysis (snapshot original TAF fields as "before")
       ▼
  9  AUTO-APPLY ENHANCEMENT  → writes improved values back into the TAF
       │     (original preserved in form_fields_snapshot; only on HIGH
       │      similarity runs — low-similarity runs keep the student's text)
       ▼
 10  Log the AI + SerpAPI cost  (source: taf_analyze / taf_reanalyze)
```

### 7.1 💡 How SBERT works (the embeddings engine)

The whole similarity feature runs on **SBERT — Sentence-BERT**, a supervised variant of BERT fine-tuned to produce dense vectors where _semantically similar sentences map to nearby points_ in a high-dimensional space.

#### The core idea you need to hold onto

SBERT's job is to turn **meaning into geometry**. Every piece of text becomes a **point** in a 384-dimensional space. Two texts that **mean the same thing** land **near each other**; texts with **nothing in common** land **far apart**. Similarity then becomes a geometric question — _how close are the two points?_ — which is a fast arithmetic operation, not a slow "read-and-judge" one.

**Why this is powerful:** it captures **synonyms and paraphrase**, not just matching words. "students dropping out of college" and "university attrition rates" share almost no words, but SBERT maps them close together. This is what separates it from a naive keyword search.

**The specific model:** `Xenova/all-MiniLM-L6-v2`

- A **DistilBERT-based** "MiniLM" model — small, fast, good accuracy.
- Outputs **384-dimensional** vectors (that's why the DB column is `VECTOR(384)`).
- Runs **on the server CPU** via **ONNX Runtime through `@xenova/transformers`** — no Python, no GPU, no network call, **no cost**.
- Handles ~512 tokens of input at a time (we truncate text to ~8,000 chars).

#### Step-by-step: how a block of text becomes one vector

1. **Tokenize.** The text is split into sub-word tokens by a WordPiece tokenizer (`WordPiece`). Common words get one token; rare words are broken into pieces. Each token starts as a lookup vector.
2. **Contextualize.** The tokens pass through **12 transformer attention layers**. Crucially, each token's final vector is _contextual_ — its meaning depends on the surrounding tokens, so "bank" in "river bank" has a different vector than "bank" in "data bank."
3. **Pool.** We take all per-token vectors and **mean-pool** them (average) into a single sentence/paragraph vector. This one vector represents the whole text's meaning.
4. **Normalize.** The vector is **L2-normalized** (scaled so its length = 1).

```
"AI reduces student dropout by predicting at-risk learners"
   ↓ WordPiece tokenize
[ai, reduce, ##s, student, drop, ##out, by, predict, ##ing, at-ris, ##k, learner, ##s]
   ↓ transformer attention (contextual vectors)        ↓ 12 layers
[vec_0, vec_1, ... vec_12]     every token now "knows" its context
   ↓ mean pooling                                       ↓ average all 13
            one 384-dim vector  v
   ↓ L2 normalize                                       ↓ length → 1
            v  (|v| = 1)
```

#### Why cosine similarity becomes a dot product

Because every vector has length exactly 1, the cosine of the angle between two vectors simplifies to their dot product (`cos(θ) = a·b / |a||b|` and `|a|=|b|=1`, so `cos(θ) = a·b`). That's a single fast multiply-and-accumulate loop of 384 multiplications — which is why comparing a TAF against hundreds of journals is effectively instant vector math.

```ts
// server/analysis/similarity.ts — the core
const result = await pipe(cleaned, { pooling: "mean", normalize: true });
// result.data  = [384] floats

function cosineSimilarity(a, b) {
  // already L2-normalized
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // ~ 0..1
}
// × 100 → percentage  e.g. 0.8723 → 87.23%
```

#### A concrete worked example

Imagine two vectors (in 2-D only for illustration; the real ones are 384-D):

```
the TAF:     "AI to predict student dropout in e-learning"        → v_t = (0.8, 0.6)
a journal:   "predicting MOOC attrition with machine learning"    → v_j = (0.9, 0.4)
a journal:   "nutritional effects of vitamin D on bone health"    → v_b = (-0.1, 0.9)
```

- `cos(v_t, v_j) = 0.8·0.9 + 0.6·0.4 = 0.72 + 0.24 = 0.96` → **96%** (very similar)
- `cos(v_t, v_b) = 0.8·(−0.1) + 0.6·0.9 = −0.08 + 0.54 = 0.46` → **46%** (only vaguely related)

The first journal shares the _topic_ (prediction, education, ML) despite different wording, so it scores high; the vitamin-D paper barely relates, so it scores low. This is exactly how the real 384-dim comparison works, just higher-dimensional.

#### The cosine similarity formula (the arithmetic behind every score)

A vector is a **list of numbers** (384 for our model). Cosine similarity measures _how much two vectors point the same direction_ — a fraction between −1 and +1:

```
                   A1×B1 + A2×B2 + ... + A384×B384        (A · B)
   cos_sim(A, B) = ─────────────────────────────────   =  ───────
                   √(A1²+...+A384²) × √(B1²+...+B384²)     |A|·|B|
```

- **`A · B` (dot product)** = add the products of each matching position.
- **`|A|`, `|B|` (magnitude)** = √ (sum of each component squared).
- Because SBERT **normalizes** every vector to length 1, `|A| = |B| = 1`, so the formula simplifies to **`cos_sim = A · B`** — pure dot product, no division.

**Meaning of the result:**

| value      | meaning                        |
| ---------- | ------------------------------ |
| ≈ **+1.0** | same topic / identical meaning |
| ≈ **+0.5** | somewhat related               |
| ≈ **0**    | unrelated (perpendicular)      |
| ≈ **−1**   | opposite meaning               |

**Intuition:** when two vectors point the same way, their matching positions are both large-and-same-sign, so each product is positive and the sum is big. When they point differently, a big positive meets a big negative and the products cancel toward zero. _That is all cosine similarity does — it adds up the position-by-position agreement._

**Worked by hand (3 numbers, same math as 384):**

```
TAF    = [0.8,  0.6,  0.3]
Jrnl1  = [0.9,  0.4,  0.2]        Jrnl1 shares the topic
Jrnl2  = [0.1, -0.5,  0.9]        Jrnl2 is unrelated

TAF·Jrnl1 = (0.8·0.9)+(0.6·0.4)+(0.3·0.2) = 0.72+0.24+0.06 = 1.02
|TAF| ≈ 1.04, |Jrnl1| ≈ 1.00   →  cos ≈ 1.02/1.04 ≈ 0.98 → 98%

TAF·Jrnl2 = (0.8·0.1)+(0.6·−0.5)+(0.3·0.9) = 0.08−0.30+0.27 = 0.05
cos ≈ 0.05/≈1.05 ≈ 0.05                                      → 5%
```

Same-topic vectors: large positive products, big sum. Unrelated: products cancel. This exact formula is what `findTopSimilarByVector` (journals), `findTopSimilar` (Scholar), and `computePairSimilarity` all run — the only difference is whether the vectors were pre-stored (journals) or computed live (Scholar).

### 7.2 Journal upload — end to end (`server/actions/journals.ts`)

When the department uploads a PDF on the **Journals** page, this pipeline runs:

```
PDF file
  │
  ▼ ① upload to Supabase Storage (bucket: "journals")
  │
  ▼ ② extractPdfText()  — pdfjs-dist reads every page's text layer
  │      (uses bundled standard fonts via standardFontDataUrl so
  │       embedded-text PDFs extract correctly)
  │      → if the extracted text is trivially short (< 50 chars), the
  │        client runs OCR (tesseract.js, lib/pdf-ocr.ts) as a fallback
  │        for scanned PDFs and uses the OCR text if it's longer
  │
  │      ⚠️ The FULL extracted text is saved to journals.extracted_text,
  │      so ALL content is stored — but only the "core" (below) is
  │      used for the embedding vector. Two different things:
  │        · extracted_text = everything (what you can read in the UI)
  │        · embedding       = the "academic core" fingerprint only
  │
  ▼ ③ extractJournalMetadata()  — the LLM reads the text ONCE
  │      and returns { title, authors }
  │      (this is the only paid AI call at upload → logged cost,
  │       source = "journal"; max_tokens raised to 16000 so a reasoning
  │       model's chain-of-thought doesn't starve the JSON answer)
  │
  ▼ ④ extractEmbeddingCore()  — picks the ACADEMIC CORE:
  │      keeps title + abstract + early intro, cuts at the first
  │      section boundary (Introduction / Abstract / Recommendation /
  │      Conclusion / References / Keywords / Discussion / Results /
  │      Methodology)
  │      → stored as embedding_text
  │      (why? Recommendation/Conclusion/future-work sections read
  │       like a student proposal and would INFLATE similarity)
  │
  ▼ ⑤ embedJournalText(core)  — local SBERT → 384-dim vector
  │      → stored as journals.embedding  (VECTOR(384))
  │
  ▼ ✅ journal ready for comparison
```

> `hasText` flag on the journal tells you whether text extraction succeeded (journals with no embeddable text are skipped by internal matching — they can't be compared).

### 7.3 Internal comparison — candidate retrieval and aspect scoring

```
TAF fields (title, background, objectives, methodology, RRL)
  │  htmlToPlainText()  (strip rich-text HTML)
  ▼ buildComparisonText()  → one big plain string
  ▼ embedText(myText)  → a fresh 384-dim vector for THIS TAF
  │
  │  Stage 1: compare with stored journal vectors
  │  Include recent journals and journals without a readable year.
  │
  │  For each included journal:
  │     raw[j] = cosine(taf_vec, journals[j].embedding)
  │
  ▼ keep the 5 highest cosine matches
  ▼ Stage 2: score these matches using proposal sections
  ▼ sort by final match score
```

- TAF text is embedded once for candidate retrieval; journal vectors are stored at upload. Stage 2 embeds the TAF aspects and retrieved candidates to calculate the displayed match scores.
- The recency gate uses the current year and includes journals with no parseable year.
- Up to five candidates are rescored and shown as "Internal Matches (Journals)" with their aspect-based scores.

### 7.4 External comparison — Google Scholar

- A keyword query is built from the TAF title and objectives using the **NLP pipeline** (`lib/nlp.ts`): tokenize, remove stop words, and Porter-stem for deduplication; original word forms go to Scholar. Domain anchors may also be added. This NLP applies to the **search query only, never to SBERT**.
- `searchGoogleScholar` (SerpAPI) returns ~10 results.
- **Recency gate:** only Scholar results with a parseable year in the last **5 years** are kept.
- Scholar results have **no stored vectors**. The first stage embeds their titles and summaries to retrieve up to five candidates; Stage 2 scores those candidates by proposal aspects, as described below.

### 7.5 Scoring — aspect-based match scores and combined judgment

The score estimates how closely a proposal relates to existing work. For each source, the app first finds up to five candidates by comparing the full text, then scores them again using specific proposal sections.

#### Stage 2 — Aspect scores for each candidate

Institutional boilerplate is stripped before aspect embeddings are compared. The proposal is represented by four aspects:

| Aspect      | Proposal text        |  Weight |
| ----------- | -------------------- | ------: |
| Objectives  | Title + objectives   | **35%** |
| Subject     | Title + background   | **30%** |
| Methodology | Methodology          | **20%** |
| Full text   | Full comparison text | **15%** |

Each aspect's raw cosine percentage is independently noise-reduced and rescaled to 0–100. The corpus-specific floor is **28% for internal journals** and **22% for external Scholar results**:

```
raw <= floor  →  0
raw > floor   →  ((raw - floor) / (100 - floor)) × 100
```

The four reduced aspect scores are combined using the weights above. If both the objective and subject scores are below **15**, the candidate is treated as weak topical overlap and its final score is capped at **12**. An internal match between a risk-analytics proposal and an administrative campus-system journal receives the same cap when the match is only a campus-neighbor result.

#### Rank-weighted aggregate (per source)

The final match scores are sorted highest to lowest. Higher-ranked matches count more:

| Rank  | Weight  |
| ----- | ------- |
| Top 1 | **40%** |
| Top 2 | **25%** |
| Top 3 | **15%** |
| Top 4 | **12%** |
| Top 5 | **8%**  |

#### Combined score and judgment

```ts
combined = 0.40 × internalAggregate + 0.60 × externalAggregate
judgment = combined >= HIGH_SIMILARITY_THRESHOLD (25) ? "high_similarity" : "low_similarity"
```

| Component          |   Weight | Source              |
| ------------------ | -------: | ------------------- |
| Internal aggregate | **0.40** | Department journals |
| External aggregate | **0.60** | Google Scholar      |

**Key rules:**

- Up to five matches from each source contribute to its score.
- Department journals count for **40%** of the combined score; Scholar results count for **60%**.
- The 25-point threshold determines whether the result is labeled high or low similarity.
- This score is a guide, not a plagiarism decision. Scholar results can change between searches.
- Each version keeps the score for the TAF text that was analyzed. Enhancement is applied only on high-similarity runs.

### 7.6 Gemini analysis and suggestions

The app uses the Google Gemini API, accessed with `GEMINI_API_KEY`. Gemini receives:

- The student's TAF fields
- **department journal matches** and **Scholar matches**, including scores and available text

The analysis returns:

- `sdgCategories` — 1–3 relevant UN SDGs
- `fieldOfIt` — the primary IT/CS field
- `researchGapAnalysis` — a 4–6 sentence gap analysis citing the matched works
- `recommendations` — title/background suggestions
- `enhancement` — improved title / background / objectives / RRL / references + a change summary
- `similarityReduction` — **a "How to Lower Your Similarity" guide**: identifies the top-1 match driving the score, explains _why_ the TAF still overlaps it (which research dimension — technology/scope/population/method), and gives 3–5 concrete changes to shift that dimension. This exists because **the score measures topic similarity, not wording** — paraphrasing barely moves it.

### 7.7 Enhancement and re-analysis

After scoring, Gemini may suggest improvements based on relevant literature and ways to distinguish the proposal's scope, participants, method, or technology. On a high-similarity run, the changes are applied to the TAF. The original fields are saved with that analysis version.

Each analysis version keeps its own score and original fields. Re-analysis scores the text at that time, so the score may change but is not guaranteed to decrease. The internal and external scores show how each source contributed.

### 7.8 Analysis summary

When a journal is uploaded, the app saves:

- `journals.extracted_text`: the full text extracted from the PDF.
- `journals.embedding_text`: the title and selected paper text used for comparison. (fed to SBERT)
- `journals.embedding`: the SBERT vector made from that selected text.

The full paper text remains available, but only selected text is used for similarity matching. This avoids letting recommendation or conclusion sections inflate a match.

During analysis, the app compares the TAF with saved journal vectors and current Scholar results. It then scores the best matches by proposal sections, combines the scores using the **40/60 internal/external weights**, and sends Gemini the TAF fields and top match details.

#### Where the results come from

| Result                                        | Produced by                               | Costs              |
| --------------------------------------------- | ----------------------------------------- | ------------------ |
| Journal title and authors                     | Gemini at upload                          | paid, once         |
| Journal comparison vector                     | Local SBERT                               | free               |
| Internal similarity score                     | SBERT comparison with department journals | free               |
| External similarity score                     | SBERT comparison with Scholar results     | free               |
| Combined score                                | 40% internal + 60% external               | -                  |
| SDGs, IT field, gap analysis, and suggestions | Gemini                                    | paid, per analysis |

> Google Scholar results can vary between searches. The combined score is a guide to similarity, not a plagiarism decision.

---

## 8. Cost Tracking

Each analysis run is recorded in **analysis_cost_logs**:

| `source`        | What it tracks                                         |
| --------------- | ------------------------------------------------------ |
| `taf_analyze`   | Gemini and Scholar search usage for the first analysis |
| `taf_reanalyze` | Gemini and Scholar search usage for later analyses     |
| `journal`       | Gemini usage for journal metadata extraction           |

- SBERT runs locally and does not add an external model usage charge.
- Logs include the Gemini model, token usage, AI cost, and SerpAPI cost.
- Each log row snapshots the **title** at insert time so it survives deletion.
- `/cost-logs` page shows summary cards, a per-source breakdown, and a **paginated** per-analysis table.

---
