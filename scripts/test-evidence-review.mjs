import {
  resolveAnalysisNextAction,
  reviewEvidence,
} from "../server/analysis/evidence-review.ts";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not configured.");
  process.exit(1);
}

const taf = {
  proposedTitle: "AI-Based Campus Flood Risk Prediction and Alert System",
  background:
    "The proposal addresses delayed flood warnings on a university campus by combining historical rainfall, water-level sensor readings, and campus incident records.",
  objectives:
    "Develop a model that predicts campus flood risk and sends early alerts to students and administrators.",
  literatureReview:
    "Prior work has used machine learning and IoT sensors for flood prediction in cities and river basins.",
  methodology:
    "Train a supervised learning model on historical rainfall and water-level data, validate it using held-out events, and evaluate alerts with campus users.",
  referenceList: "Sample references for dry-run testing.",
};

const sources = [
  {
    id: "JOURNAL-sample-1",
    kind: "internal",
    title: "IoT Flood Monitoring for University Campuses",
    passage:
      "The study developed an IoT flood monitoring system for a university campus. Water-level sensors triggered threshold-based SMS alerts to students and administrators. The project did not build or evaluate a predictive machine-learning model.",
    link: "https://example.edu/internal-flood-study.pdf",
    page: null,
    limitation: "Sample passage; page numbers are unavailable.",
    sbertScore: 38.4,
    aspects: { obj: 42.1, subj: 36.2, meth: 24.8, full: 31.5 },
  },
  {
    id: "SCHOLAR-1",
    kind: "external",
    title: "Machine Learning Models for Urban Flood Forecasting",
    passage:
      "Machine Learning Models for Urban Flood Forecasting. The paper compares supervised learning algorithms using rainfall and river-level observations to forecast urban flooding. It does not evaluate campus alerts or university users.",
    link: "https://example.org/urban-flood-forecasting",
    page: null,
    limitation: "Only a sample title and abstract-style passage are supplied.",
    sbertScore: 44.7,
    aspects: { obj: 47.3, subj: 40.1, meth: 39.6, full: 37.2 },
  },
];

const execution = {
  internal: {
    retrieval: "completed_with_matches",
    scoring: "completed",
    evidence: "limited",
    error: null,
  },
  external: {
    retrieval: "completed_with_matches",
    scoring: "completed",
    evidence: "limited",
    error: null,
  },
};

const evidenceResult = await reviewEvidence({ taf, sources });
const sbertJudgment = "low_similarity";
const nextAction = resolveAnalysisNextAction({
  judgment: sbertJudgment,
  execution,
  reviewStatus: evidenceResult.status,
  review: evidenceResult.record.review,
});

console.log(
  JSON.stringify(
    {
      reviewStatus: evidenceResult.status,
      model: evidenceResult.record.model,
      promptVersion: evidenceResult.record.promptVersion,
      assessment: evidenceResult.record.review?.assessment,
      summary: evidenceResult.record.review?.summary,
      findings: evidenceResult.record.review?.findings,
      recommendations: evidenceResult.record.review?.recommendations,
      limitations: evidenceResult.record.review?.limitations,
      failure: evidenceResult.record.failure,
      usage: evidenceResult.record.usage,
      sbertJudgment,
      nextAction,
    },
    null,
    2,
  ),
);

if (evidenceResult.status === "unavailable" || evidenceResult.status === "invalid") {
  process.exitCode = 1;
}
