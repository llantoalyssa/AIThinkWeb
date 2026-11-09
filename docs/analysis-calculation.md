# How AIThink Scores a Topic Abstract Form (TAF)

**Audience:** developers, advisers, and anyone who needs to defend or audit a score.
**Scope:** the similarity analysis that runs when a student clicks *Analyze* / *Re-analyze*.
**Source of truth:** the code, not this document. Every constant named here lives in
`lib/constants.ts`; every step is linked to the file that implements it.

---

## 1. What the score actually is

The headline number is a **calibrated topical-relatedness percentage**, not "percent of
copied text".

That distinction matters:

- A raw embedding cosine of `0.46` does **not** mean "46% of the document is copied". It
  means two texts sit close together in a 384-dimensional semantic space — which happens
  trivially between two papers in the same field, written in the same institution's house
  style, sharing the same formatting boilerplate.
- So the pipeline applies a **noise floor** per corpus (campus journals are noisier than
  Google Scholar), an **aspect gate** (a match must share the *topic*, not just the
  wording), and a **rank-weighted average** (the best match dominates; the 5th barely
  counts).

The final verdict is a single comparison:

```
combined ≥ 25  →  high_similarity   ("may need revisions")
combined < 25  →  low_similarity    ("low detected overlap within the searched sources")
```

`HIGH_SIMILARITY_THRESHOLD = 25` — deliberately low on a 0–100 scale because the number is
*calibrated*, and calibration removes ~22–28 points of baseline noise by construction.

---

## 2. Pipeline at a glance

```
TAF fields
   │
   ├─ validation (all fields present, minimum lengths, ≤5 analyses)
   │
   ├─ one text blob  ─────────────►  Stage 1: retrieval
   │                                   ├─ internal: cosine vs stored journal embeddings → top 5
   │                                   └─ external: Google Scholar → keyword query → top 5
   │
   └─ four aspect texts ──────────►  Stage 2: aspect rescoring (top-5 only)
                                       ├─ per-aspect cosine (obj / subj / meth / full)
                                       ├─ noise floor per corpus
                                       ├─ fusion 35/30/20/15
                                       └─ gates: weak topical, campus neighbor
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        │                                           │
             internal aggregate (rank-weighted)         external aggregate (rank-weighted)
                        │                                           │
                        └──────────►  combined = 0.40·int + 0.60·ext
                                                   │
                                     judgment at 25% threshold
                                                   │
                                     AI layer (narrative only — never the score)
```

Two embeddings models are involved and they are *different things*:

| Model | Job | Dimensions | Cost |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` (ONNX, in-process) | similarity: every cosine in the pipeline | 384 | free, local |
| DeepSeek (OpenAI-compatible API) | narrative: SDG tags, field of IT, gap analysis, suggestions | — | paid per token, logged to `analysis_cost_logs` |

The similarity score is produced **entirely by the local model**. The LLM never sees the
numbers that form the score and cannot change it.

---

## 3. Inputs and validation

Before any embedding happens (`server/actions/analyze-taf.ts`, `analyzeTAF`):

| Check | Rule | Failure message |
|---|---|---|
| Role | student only | "Only students can analyze TAFs." |
| Ownership | TAF row must belong to the caller | "TAF not found or you don't have access." |
| Content floor | assembled text ≥ 25 chars | "Your Topic Abstract is too short to analyze." |
| Required fields | title, background, objectives, literature review, methodology, reference list — none empty | "*\<Field\>* is empty. All fields must be filled in before analysis." |
| Minimum length | every field except the title ≥ **1000** chars; **Reference List** ≥ **500** | "Some fields are still below the minimum length. Still short: …" |
| Version cap | ≤ **5** analyses per TAF | "You have reached the maximum of 5 analyses for this TAF." |

**The comparison text** is built from five fields only:

```
proposed_title + background + objectives + methodology + literature_review
```

The **reference list is deliberately excluded** from the similarity text — a bibliography
is mostly shared citation strings, which would inflate every score. It is still required to
be filled in, because the AI layer reads it.

---

## 4. Stage 1 — retrieval (who is worth comparing against)

### 4.1 Embedding

`server/analysis/similarity.ts`

- Model: `Xenova/all-MiniLM-L6-v2` — 384 dimensions, loaded once and reused
  (module-level promise; it is a *model* cache, so nothing can go stale).
- Text is whitespace-collapsed and truncated to **8 000 characters** before embedding.
- Pooling: **mean**; then **L2-normalised** — which is why cosine similarity is computed as
  a plain dot product.
- Percentage conversion: `round(cosine × 10 000) / 100` (two decimals, e.g. `0.4630 → 46.30`).

### 4.2 Internal candidates (campus journals)

`journals` are embedded once at upload and stored as `pgvector`. For each analysis:

1. Load every journal that has an embedding.
2. **Recency filter:** journals whose `year` is older than `currentYear − 5` are skipped
   (`getRecencyCutoffYear`). Journals with no parseable year are kept.
3. Cosine against the TAF text → **top 5**.

No database-side vector index is used; the comparison runs in JS over the loaded set.

### 4.3 External candidates (Google Scholar)

`server/analysis/external-search.ts`

1. Query = up to 8 keywords (`extractKeywords`, min length 3) from **title + objectives**,
   with institutional tokens removed (`isInstitutionalKeywordToken`) and domain anchors
   added (`scholarDomainAnchors`). Falls back to `DEFAULT_SEARCH_QUERY` if empty.
2. SerpAPI returns up to **10** results; cost is a flat **$0.01 per call**, logged only when
   the call succeeds.
3. Results with a year older than the same 5-year cutoff are dropped (undated results are
   dropped too).
4. Candidate text = `title + summary`; cosine vs the TAF → **top 5**.

---

## 5. Stage 2 — aspect rescoring (how similar it *really* is)

`server/analysis/aspect-similarity.ts`

Stage 1 asks "is this the same neighbourhood?". Stage 2 asks "do these two documents share
the same research substance?" — by comparing four *views* of the TAF against the candidate.

### 5.1 The four aspect texts

| Aspect | Built from | Cap |
|---|---|---|
| `obj` (Objectives) | title + objectives | 4 000 chars |
| `subj` (Subject / Background) | title + background | 4 000 chars |
| `meth` (Methodology) | methodology (falls back to title if empty) | 4 000 chars |
| `full` (Full text) | the whole comparison text | 8 000 chars |

Institutional boilerplate is stripped from **both** sides first (`stripBoilerplate`): the
university name, college, campus, "Batangas State University", standard formatting phrases,
and similar house style. Without this, every pair of campus papers shares ~20 points of
"similarity" that is pure letterhead.

Then each aspect is embedded and compared to the candidate embedding:

```
raw_obj  = cosine(taf.obj,  candidate)
raw_subj = cosine(taf.subj, candidate)
raw_meth = cosine(taf.meth, candidate)
raw_full = cosine(taf.full, candidate)
```

Note all four are compared against the **same** candidate vector — the candidate is one
document, not four.

### 5.2 Noise floor (the calibration)

`lib/constants.ts → noiseReduce`

```
calibrated = raw ≤ floor ? 0 : (raw − floor) / (100 − floor) × 100
```

| Corpus | Floor | Why |
|---|---|---|
| Internal (campus journals) | **28** | Same institution, same template, same faculty vocabulary |
| External (Google Scholar) | **22** | Broader corpus, but still same discipline |

Worked: `raw 46.30`, floor 28 → `(46.30 − 28) / 72 × 100 = 25.42`.
The same raw 46.30 against the external floor 22 → `(46.30 − 22) / 78 × 100 = 31.15`.

This is the single most important thing to understand about the number: **a raw cosine of
28 or below contributes exactly zero**, on purpose.

### 5.3 Aspect fusion

```
matchScore = 0.35·obj + 0.30·subj + 0.20·meth + 0.15·full
```

| Weight | Constant | Meaning |
|---|---|---|
| 0.35 | `ASPECT_WEIGHT_OBJ` | Same objectives is the strongest signal of a duplicated study |
| 0.30 | `ASPECT_WEIGHT_SUBJ` | Background/context overlap |
| 0.20 | `ASPECT_WEIGHT_METH` | Same method is common across unrelated studies — weaker |
| 0.15 | `ASPECT_WEIGHT_FULL` | Whole-document similarity, diluted by length |

Worked: `obj 25.00, subj 10.00, meth 34.00, full 18.00`
→ `8.75 + 3.00 + 6.80 + 2.70 = 22.25`.

### 5.4 Gates (when a high number is downgraded)

**Weak topical overlap** — after calibration, if *both* objectives and subject are below
`ASPECT_GATE_FLOOR = 15`, the two documents are not about the same thing regardless of
wording. The score is capped at `ASPECT_WEAK_SCORE_CAP = 12` and the match is flagged
`Weak topical overlap` in the UI.

**Campus neighbour** — internal matches only. If the TAF is a risk/analytics study
(`isRiskAnalyticsTaf`) and the candidate journal reads like an administrative campus system
paper (`isAdminSystemJournal` — tracer/alumni, payroll, syllabus, attendance monitoring,
faculty evaluation, answer sheets, grading), the pairing is
usually a shared-vocabulary artefact of "we both use MySQL and surveys". It is force-flagged
as weak **and** capped at 12.

**Phrase quality** — `topical` / `institutional_only` / `none`, derived from the shared
n-grams. A match whose only overlap is institutional phrasing is reported as such; the
phrase list drives the highlight chips and the per-section explanations ("why" text) that
the reviewer sees.

---

## 6. Aggregation — one number per side

`aggregateSimilarityByRank` / `rankWeightsFor`

```ts
RANK_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08]
```

With fewer than 5 matches, the weights used are **renormalised to sum to 1** — so a single
internal match carries 100% of the internal side, not 40%.

| Matches | Weights used |
|---|---|
| 5 | 0.40, 0.25, 0.15, 0.12, 0.08 |
| 4 | 0.43, 0.27, 0.16, 0.13 |
| 3 | 0.50, 0.31, 0.19 |
| 2 | 0.62, 0.38 |
| 1 | 1.00 |
| 0 | side = 0 |

```
aggregate = Σ (calibrated_match_i × weight_i)
```

Worked (3 internal matches, calibrated 30.55 / 18.20 / 9.75, weights 0.50 / 0.3125 / 0.1875):

```
15.28 + 5.69 + 1.83 = 22.80
```

If either side has no matches after a successful search, that side contributes **0**.
Unavailable retrieval or failed scoring is stored separately and makes the analysis
incomplete; it cannot clear a proposal as though the zero were valid evidence.

---

## 7. Combination and verdict

```
combined = 0.40 × internalAggregate + 0.60 × externalAggregate
```

External is weighted higher deliberately: campus journals are a small, stylistically
homogeneous corpus, while Scholar is the actual literature the student is expected to be
different from.

| Case | Internal | External | Combined | Verdict |
|---|---|---|---|---|
| A | 22.80 | 18.40 | `9.12 + 11.04 = 20.16` | **Low** |
| B | 30.00 | 28.00 | `12.00 + 16.80 = 28.80` | **High** |
| C (no Scholar matches) | 40.00 | 0.00 | `16.00` | **Low SBERT judgment; evidence review determines the next action** |

`round2()` is applied to the stored score; the comparison to the threshold uses the
unrounded value.

---

## 8. AI layers (never the score)

`server/analysis/ai-analysis.ts`

After the score exists, the TAF fields plus the **top 3 internal matches** are sent to
DeepSeek (`temperature 0.2`, `max_tokens 16 000`, `response_format: json_object`) to produce:

- `sdgCategories` — UN SDG tags (drives Research Analytics grouping)
- `fieldOfIt` — one of the nine CICS fields (`lib/constants.ts → IT_FIELDS`)
- `researchGapAnalysis` — prose shown in the review view
- `recommendations` — title / background suggestions
- `enhancement` — rewritten fields + a change summary
- `similarityReduction` — which driver caused the score and what to change

**On a low-similarity result** the enhancement and recommendations are cleared before
storage: there is nothing to fix.

`server/analysis/evidence-review.ts` performs one separate OpenAI Responses API review of
the saved TAF snapshot and up to three supplied passages from each source. It validates
source IDs and exact excerpts before accepting a finding. Retrieval/scoring failures,
unavailable reviews, conflicts, and insufficient evidence are explicit states; none can
change the SBERT score or judgment.

The derived next action is separate from the SBERT judgment:

- completed checks + low SBERT + verified `no_additional_concern` → eligible;
- completed checks + high SBERT + verified `supports_high_similarity` → revision required;
- conflicts or unavailable/insufficient review → adviser review;
- incomplete retrieval/scoring → analysis incomplete.

Enhancements are suggestions only. They are applied to the editor only after the student
explicitly accepts them, and those edits must be re-analyzed before submission.

Prompt tokens, completion tokens and the SerpAPI flat fee are priced into
`analysis_cost_logs` (`ai_provider: "opencode-go"`, $0.14/M input, $1.10/M output).

---

## 9. What gets stored

`taf_analysis_results` — one row per analysis, `version_number` 1…5:

| Column | Content |
|---|---|
| `internal_similarity_score`, `external_similarity_score`, `combined_score` | the three aggregates (2 dp) |
| `judgment` | `high_similarity` / `low_similarity` |
| `scoring_breakdown` | the full JSON audit trail of every step (raw, calibrated, weight, contribution, gates) |
| `internal_matches`, `external_matches` | per-match display data incl. aspects, phrases, explanations |
| `sdg_categories`, `field_of_it` | AI classification |
| `research_gap_analysis`, `recommendations`, `enhancement`, `similarity_reduction` | AI narrative |
| `form_fields_snapshot` | the TAF fields **as they were analysed** (the basis for "restore original" and for diffing later edits) |
| `evidence_review_status`, `evidence_review` | validated evidence review, supplied sources, model/prompt version, limitations, failure, and usage |
| `analysis_execution` | internal/external retrieval, scoring, and evidence availability states |
| `next_action` | eligibility, revision, adviser-review, or incomplete outcome |

The **scoring breakdown is the audit trail.** The "Detailed Scoring → View More" dialog
renders it verbatim: per side, per rank, `raw → calibrated → weight → contribution`, plus
the combine line and the verdict. If a score is ever questioned, that JSON is the answer.

---

## 10. My own reading of the design — why these numbers, and where I would push back

This section is opinion, not specification. It explains *why* I think the constants are
defensible, what each one is really buying, and where I think the design has a seam worth
watching. Read sections 1–9 for what the code does; read this for why it does it that way.

### 10.1 Why a noise floor at all — and why 28 vs 22

MiniLM is not a plagiarism detector. It encodes "what is this text about", and two
undergraduate IT proposals from the same college are *always* about a similar thing: a web
or mobile system, a survey of users, a database, a local government or school setting, the
same faculty vocabulary. Empirically that puts unrelated same-field pairs in the high
teens/low twenties and lightly-related pairs in the high twenties. Without a floor, every
paper would score ~30 before any real comparison happened, and the verdict would be driven
by corpus style rather than substance.

The floor is a **linear re-map that zeroes the band where "related but not similar" lives**:

```
calibrated = raw ≤ floor ? 0 : (raw − floor) / (100 − floor) × 100
```

It is monotonic — it never reorders two candidates — so it costs nothing in ranking and
buys interpretability: 0 now means "no more related than a random same-field paper".

**Why internal is higher (28) than external (22).** This is the sharpest of the constants
and I think it is correctly asymmetric:

- Campus journals are a **small, house-styled corpus** — same template, same section
  headings, same "Chapter 1: The Problem and Its Background", same university phrasing. Two
  unrelated capstone papers share far more surface vocabulary than two unrelated papers from
  different universities and decades.
- Even after `stripBoilerplate` removes the explicit letterhead (BSU, JPLPC, TNEU, CICS,
  "web-based system"), the *shape* of the prose survives. Residual style similarity is real
  and unavoidable.
- Scholar results are written by thousands of different authors across many years, so the
  baseline overlap for a genuinely unrelated paper is genuinely lower.

A single floor for both sides would either let campus noise through (floor 22) or
systematically punish external matches (floor 28). Two floors cost nothing and are the
honest description of two different corpora.

**Where I'd push back:** if the journal corpus ever grows into a genuinely diverse library —
thousands of papers from many institutions — 28 becomes too aggressive and will suppress
real internal matches. The floor is a property of *this* corpus, not a universal truth, and
that is exactly why the breakdown exposes both values rather than hiding one.

### 10.2 Why 40/60 internal vs external

External carries 60% because it is the thing the student is actually supposed to be
different from: the published literature. Internal comparison is a bonus — it catches the
most damaging and most likely case (the same college, the same adviser's previous students,
the same topic two years apart), but the campus corpus is small and stylistically
homogeneous, so trusting it as the majority signal would import its noise into the verdict.

My argument for the split is not that internal matters less — it's that **internal is more
prone to false positives per point**, so each internal point is worth less. 40/60 is a
confession about data quality, not about importance.

Note the asymmetry this creates, which is worth being explicit about:

| Scenario | Combined | Verdict |
|---|---|---|
| Internal only, excellent (60) | `0.4 × 60 = 24.0` | **Low** — always, by construction |
| External only, moderate (45) | `0.6 × 45 = 27.0` | **High** |
| Both good (40 / 50) | `16 + 30 = 46.0` | **High**, comfortably |

So a student cannot be flagged on internal evidence alone, while external evidence alone can
flag them. I think that is the correct bias: campus-only similarity is the weaker claim and
should not, on its own, force a revision. The flip side is section 10.5.

### 10.3 Why the rank weights decay like that

```
RANK_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08]
```

This is a **geometric-ish decay** — each slot is worth roughly 60–65% of the one above it
(0.40 → 0.25 → 0.15 ≈ 0.63×), except the last pair which flattens (0.12 → 0.08) to keep the
5th match from being rounded to nothing.

What that buys: a single strong match dominates the side. That matters because the failure
mode we care about — "this proposal duplicates that one study" — is a **single-hit** event,
not a diffuse one. A plain mean would dilute one 60% match with four 3% matches down to
~14%, i.e. it would hide exactly what we want to surface. A plain max would be too brittle
(one lucky cosine decides everything).

The renormalisation when fewer than 5 matches exist is the detail I would defend most
strongly: a single match carries 100% of its side, because "the best of one" is the whole
story. Leaving the weights un-renormalised would silently cap a one-match side at 40% and
make small-corpus days look artificially clean.

**Where I'd push back:** the tail is still flat-ish. Five capped weak matches contribute
`0.40+0.25+0.15+0.12+0.08 = 1.00` of a side at 12% each → aggregate 12 → 4.8 combined. That
is safely below 25, so the cap does its job, but the design has no *count* penalty: ten weak
matches would score the same as five. If false positives from noisy corpora ever appear, the
cheapest fix is not the weights — it's requiring the top match to clear a bar on its own
before the side counts at all.

### 10.4 Why the aspect weights are 35/30/20/15

| Weight | Aspect | Why it deserves that share |
|---|---|---|
| 0.35 | Objectives | The clearest statement of *what the study is for*. Two proposals with the same objectives are the same study, even if worded differently. Highest signal, hardest to fake by paraphrasing. |
| 0.30 | Subject/Business background | The problem framing — who the users are, what process is being automated, which locale. Related studies share the problem; independent studies rarely do. |
| 0.20 | Methodology | Real but weaker: "we used Agile, PHP, MySQL and a UAT survey" is true of hundreds of unrelated capstones. Worth counting, not worth dominating. |
| 0.15 | Full text | Whole-document overlap, diluted by length and by shared boilerplate. It is the most "honest" view and the least decisive one, so it gets the smallest share. |

The ordering I'd argue for is exactly this: **semantics of purpose > context > method >
surface**. Weighting methodology higher is a common mistake in naive similarity tools — it
inflates the score for every pair of student projects in the same programme.

**Where I'd push back:** 0.15 for full-text may be slightly low for detecting *copy-paste*
with padded sections (a student pasting a whole paper but rewriting the objectives). If the
product ever needs copy-paste detection specifically, full-text and a longest-common-passage
check belong in the pipeline; this weighting is tuned for *topical duplication*, which is the
question the college is actually asking at proposal stage.

### 10.5 Why the gate floor is 15 and the cap is 12

The gate answers a different question from the weights: not "how similar numerically" but
"are these even about the same thing".

- **`ASPECT_GATE_FLOOR = 15`** on *both* objectives and subject, post-calibration. Calibrated
  15 is a low bar on purpose — it is not asking for a close match, only for evidence that the
  two documents share *any* substantive topic. Requiring both aspects (not either) is what
  prevents "shares a method" from counting as "same topic".
- **`ASPECT_WEAK_SCORE_CAP = 12`** is chosen so the capped band is harmless in aggregate: five
  capped matches make an internal aggregate of 12, which is 4.8 combined — an order of
  magnitude below the 25 threshold. The cap is not a fudge factor, it is the statement that
  *this pair is not evidence*, while still letting it appear in the list for transparency.

I like that the pair is still **shown, capped and labelled**, rather than filtered out. A
reviewer seeing "campus neighbor — 12.00%" understands the tool's reasoning; a reviewer
seeing an empty list learns nothing and may assume the analysis failed.

The risk-neutral objection is that the cap can hide a real hit (a genuine duplicate that
happens to trip `isAdminSystemJournal`). I accept that trade: a false "low" costs a student
nothing, a false "high" costs them a revision cycle and their adviser's trust.

### 10.6 Why the threshold is 25

25 is not arbitrary — it is where the weighting and the floors put a *modest but real*
overlap. Solving `0.4X + 0.6Y = 25`:

| Internal | External needed |
|---|---|
| 0 | 41.7 |
| 10 | 35.0 |
| 25 | 25.0 |
| 40 | 15.0 |
| 60 | 1.7 |

So "high similarity" means roughly: **a genuinely comparable published paper, plus at least
some campus overlap** — or a moderately similar external match on its own. It is not "a match
exists", and it is not "two papers in the same field" (that lands in the teens after
calibration).

I think 25 is on the **conservative** side for a plagiarism-adjacent tool, and that is
deliberate: for a document that will be read by four approvers, a false alarm is more
expensive than a miss. Every point of threshold you add is a real reduction in reviews that
never needed to happen.

**Where I'd push back:** 25 combined is easy to reach through one strong external match and
near-zero internal evidence (`internal 0 / external 42`). If the college's actual concern is
"same college, previous years", the threshold is fine but the *weights* are backwards for
that concern — you would want internal weighted higher and the corpus diversity to justify it.

### 10.7 What I think the design gets right

1. **It refuses to be a number without a derivation.** The stored `scoring_breakdown` lets any
   score be reconstructed step by step — raw, calibrated, weight, contribution, gate. Most
   similarity features in student systems give a percentage and no explanation, which is
   useless the moment a student disputes it.
2. **The bias is toward innocence, consistently.** Higher internal floor, weight on the more
   diverse corpus, gates that cap rather than promote, a threshold that needs corroboration.
   Every one of those choices makes a false accusation less likely at the cost of missing some
   real overlaps. For an academic-integrity *signal* (not a verdict) that is the right
   direction.
3. **Calibration is explicit and per-corpus.** The floor is visible in the UI, not buried in a
   model. When the corpus changes, the adjustment is a constant, not a retrain.
4. **The AI cannot move the score.** Separation of "measure" from "advise" means a model change
   or a prompt tweak can never silently change a verdict.
5. **Versioned, not overwritten.** Each re-analysis stores its own snapshot, so "the score
   changed after I edited" is answerable rather than mysterious.

### 10.8 What I think is genuinely weak

1. **Top-5 retrieval is the real ceiling.** Everything downstream is careful, but a heavily
   paraphrased copy can simply fall outside the five candidates and score near zero. Widening
   retrieval (or adding a passage-level index) is worth more than any weight tuning.
2. **The external side is a single API call.** One failed or thin Scholar response caps the
   maximum achievable score at 40 — a silent quality cliff. The UI should say "external
   comparison unavailable" rather than presenting 20 as if it were a full analysis.
3. **No length/coverage normalisation between fields.** A 1 000-char methodology and a
   6 000-char methodology are embedded with equal authority; `full` is truncated at 8 000
   chars, which quietly favours shorter documents.
4. **Constants are global.** A literature-heavy study and a systems-development study have
   different natural baselines, but both are scored with the same floors, weights and
   threshold. A per-field calibration would be more accurate; it would also be harder to
   explain, which is a real cost.
5. **No `calibration_version` on the row.** Change any constant and old scores are no longer
   comparable with new ones, with nothing in the data to tell you which regime produced which
   row. That is a one-line schema addition and I would make it before the first tuning pass.

### 10.9 One-sentence summary of my view

The constants are internally consistent and defensible for a **small campus corpus scored
conservatively at proposal stage** — the asymmetry (28 vs 22, 40/60), the geometric rank
decay, and the 15/12 gate are each buying a specific protection against false accusation; the
design's weakest points are not these numbers at all, but the fixed top-5 retrieval window and
the single external API dependency, both of which cap accuracy before any weight is applied.

---

## 11. Interpretation caveats

1. **Not plagiarism detection.** This compares semantic relatedness of *proposals*. Two
   students in the same field with different studies will legitimately score in the teens.
2. **Calibrated, not raw.** A 25% calibrated score can correspond to a raw cosine in the
   high 40s. Never quote the headline number as a raw cosine.
3. **Coverage limits the ceiling.** No external results ⇒ maximum 40. No internal journals
   uploaded ⇒ maximum 60. Both empty ⇒ 0, and the verdict is meaningless rather than "good".
4. **The top 5 wins.** A genuine copy sitting at rank 6 is invisible. Retrieval is cosine on
   the whole document; a heavily paraphrased copy can fall out of the top 5.
5. **Recency window is 5 years.** Older journals are not compared, even if they exist.
6. **Gates can mask a real hit.** A study that shares vocabulary with an admin-system paper
   is capped at 12 by design — correct on average, occasionally wrong on an individual pair.
7. **Re-runs are versioned, not recomputed in place.** A re-analysis after editing creates a
   new version; old versions keep their snapshot, so the earlier score remains explainable.

---

## 12. File map

| Concern | File |
|---|---|
| All constants, floors, weights, threshold | `lib/constants.ts` |
| Orchestration, validation, storage | `server/actions/analyze-taf.ts` |
| Embeddings, cosine, top-N | `server/analysis/similarity.ts` |
| Aspect rescoring, gates, fusion | `server/analysis/aspect-similarity.ts` |
| Google Scholar retrieval | `server/analysis/external-search.ts` |
| Boilerplate stripping, phrase quality, explanations | `lib/boilerplate.ts`, `lib/overlap-phrases.ts`, `lib/nlp.ts` |
| AI narrative + cost rates | `server/analysis/ai-analysis.ts` |
| Breakdown rendering | `components/scoring-breakdown-card.tsx`, `components/taf-analysis-results.tsx` |

---

## 13. Tweaking the behaviour

| Want | Change |
|---|---|
| Fewer false "high" verdicts | raise `HIGH_SIMILARITY_THRESHOLD` |
| More forgiving campus matches | lower `INTERNAL_NOISE_FLOOR` |
| Trust Scholar more | raise `EXTERNAL_WEIGHT` (and lower `INTERNAL_WEIGHT` to keep them summing to 1) |
| Rank 2–5 to matter more | flatten `RANK_WEIGHTS` |
| Catch paraphrased copies | widen retrieval (`topN` > 5) — the cheapest single lever |
| More topical precision | raise `ASPECT_WEIGHT_OBJ`, lower `ASPECT_WEIGHT_FULL` |

Any change here invalidates comparison with previously stored versions. Bump a
`calibration_version` alongside the scores if you ever need old and new numbers to coexist.
