"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import type { SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import { plainTextToHtml } from "@/lib/html";

type Props = {
  submission: SubmissionWithAnalysis;
};
const COMMITTEE_POSITIONS: Record<string, string> = {
  vcrdes: "Vice Chancellor for Research, Development and Extension Services",
  dean: "Dean, CICS",
  associate_dean: "Associate Dean, CICS",
  adviser: "Faculty Expert/Adviser",
};
const COMMITTEE_ORDER = ["vcrdes", "dean", "associate_dean", "adviser"];

export default function ExportTafForm({ submission }: Props) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);

    setTimeout(() => {
      window.print();
      setExporting(false);
    }, 50);
  }

  const snap = submission.tafSnapshot || {};

  const fields: { label: string; value: string; style?: "references" }[] = [
    { label: "Proposed Title", value: snap.proposedTitle || "" },
    { label: "Background of the Proposed Topic", value: snap.background || "" },
    { label: "General Objectives", value: snap.objectives || "" },
    { label: "Review of Related Literatures", value: snap.literatureReview || "" },
    { label: "Research Methodology", value: snap.methodology || "" },
    { label: "References", value: snap.referenceList || "", style: "references" },
  ];
  const committee = COMMITTEE_ORDER.map((role) => {
    const step = (submission.approverSteps || []).find((s) => s.role === role);
    const approved = step?.status === "approved";
    return {
      role,
      position: COMMITTEE_POSITIONS[role] ?? step?.label ?? role,
      name: approved && step?.actorName ? step.actorName : "",
      acting: approved ? Boolean(step?.standIn) : false,
      date: approved && step?.decidedAt ? step.decidedAt : null,
    };
  });

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @media print {
                body > *:not(#taf-pdf-export) { display: none !important; }
                #taf-pdf-export {
                  display: block !important;
                  font-family: "Times New Roman", Georgia, Cambria, serif;
                  color: #111;
                }

                #taf-pdf-export table { width: 100%; border-collapse: collapse; }
                #taf-pdf-export .form,
                #taf-pdf-export .form th,
                #taf-pdf-export .form td { border: 1px solid #000; }
                #taf-pdf-export .form td { padding: 5px 7px; vertical-align: top; }

                #taf-pdf-export .ref { font-size: 10px; line-height: 1.45; }
                #taf-pdf-export .form-title {
                  font-size: 15px; font-weight: 700; text-align: center;
                  letter-spacing: .06em;
                }
                #taf-pdf-export .label {
                  width: 27%; font-size: 11.5px; font-weight: 700;
                }
                #taf-pdf-export .value { font-size: 11.5px; }

                #taf-pdf-export p,
                #taf-pdf-export li {
                  font-size: 11.5px; line-height: 1.6; color: #111;
                  text-align: justify; hyphens: auto;
                  overflow-wrap: anywhere; word-break: break-word;
                }
                #taf-pdf-export p { margin: 0 0 3px; orphans: 2; widows: 2; }
                #taf-pdf-export ul,
                #taf-pdf-export ol { margin: 2px 0; padding-left: 20px; }
                #taf-pdf-export li { margin: 2px 0; }
                #taf-pdf-export .doc-references p {
                  font-size: 11px; text-align: left;
                  padding-left: 22px; text-indent: -22px; margin: 0 0 4px;
                }

                #taf-pdf-export .committee-title {
                  margin: 18px 0 3px; font-size: 12.5px; font-weight: 700;
                  text-align: center; letter-spacing: .05em;
                }
                #taf-pdf-export .committee-note {
                  margin: 0 0 7px; font-size: 11px; text-align: center;
                }
                #taf-pdf-export .committee th {
                  font-size: 11px; font-weight: 700; padding: 4px 6px;
                  text-align: center;
                }
                #taf-pdf-export .committee td {
                  font-size: 11px; padding: 8px 6px; vertical-align: middle;
                  height: 42px;
                }
                #taf-pdf-export .sign-name { font-size: 11.5px; font-weight: 700; }
                #taf-pdf-export .sign-pos { font-size: 10.5px; line-height: 1.35; }
                #taf-pdf-export .sign-date { font-size: 10px; color: #333; }
                #taf-pdf-export .tracking {
                  margin-top: 14px; font-size: 11px;
                }
                #taf-pdf-export .field {
                  border: 1px solid #000;
                  border-top: 0;
                  padding: 5px 7px;
                  break-inside: auto;
                  page-break-inside: auto;
                }
                #taf-pdf-export .field:first-child {
                  border-top: 1px solid #000;
                }
                #taf-pdf-export .field-label {
                  font-size: 11.5px; font-weight: 700; margin: 0 0 2px;
                  break-after: avoid; page-break-after: avoid;
                }
                #taf-pdf-export .form tr {
                  break-inside: avoid; page-break-inside: avoid;
                }
                #taf-pdf-export .committee-block {
                  break-inside: avoid; page-break-inside: avoid;
                }

                @page { size: A4; margin: 14mm; }
              }
              @media screen {
                #taf-pdf-export { display: none !important; }
              }
            `}</style>

            <div id="taf-pdf-export">
              {}
              <table>
                <tbody>
                  <tr>
                    <td style={{ width: "18%", verticalAlign: "middle" }}>
                      {}
                      <img
                        src="/batstateu-seal.png"
                        alt="Batangas State University"
                        style={{
                          width: "72px",
                          height: "72px",
                          objectFit: "contain",
                        }}
                      />
                    </td>
                    {

}
                    <td />
                    <td style={{ width: "24%", verticalAlign: "middle" }}>
                      <div className="ref">Reference No.: BatStateU-FO-COL-03</div>
                      <div className="ref">Effectivity Date: January 3, 2017</div>
                      <div className="ref">Revision No.: 00</div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="form" style={{ marginTop: "8px" }}>
                <tbody>
                  <tr>
                    <td className="label">Title</td>
                    <td className="value form-title">TOPIC ABSTRACT FORM</td>
                  </tr>
                  <tr>
                    <td className="label">College</td>
                    <td className="value">
                      College of Informatics and Computing Sciences
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Proponents</td>
                    <td className="value">
                      {submission.studentName || "—"}
                      {submission.studentSrCode &&
                      submission.studentSrCode !== "—"
                        ? ` (${submission.studentSrCode})`
                        : ""}
                    </td>
                  </tr>
                  <tr>
                    {
}
                    <td className="label">Program</td>
                    <td className="value">&nbsp;</td>
                  </tr>
                </tbody>
              </table>

              {

}
              <div style={{ marginTop: "8px" }}>
                {fields.map((f) => (
                  <div key={f.label} className="field">
                    <p className="field-label">{f.label}:</p>
                    {f.value ? (
                      <div
                        className={
                          f.style === "references" ? "doc-references" : undefined
                        }
                        dangerouslySetInnerHTML={{
                          __html: plainTextToHtml(f.value, { style: f.style }),
                        }}
                      />
                    ) : (
                      <p>—</p>
                    )}
                  </div>
                ))}
              </div>

              {}
              <div className="committee-block">
                <p className="committee-title">TOPIC EVALUATION COMMITTEE</p>
                <p className="committee-note">
                  The topic abstract has been thoroughly reviewed by the Topic
                  Evaluation Committee.
                </p>

                <table className="committee form">
                  <thead>
                    <tr>
                      <th style={{ width: "52%" }} />
                      <th style={{ width: "28%" }}>Signature</th>
                      <th style={{ width: "20%" }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {committee.map((m) => (
                      <tr key={m.role}>
                        <td>
                          {m.name ? (
                            <div className="sign-name">
                              {m.name}
                              {m.acting ? " (acting)" : ""}
                            </div>
                          ) : (
                            <div className="sign-name">
                              ______________________________
                            </div>
                          )}
                          <div className="sign-pos">{m.position}</div>
                          {m.date && (
                            <div className="sign-date">
                              Signed{" "}
                              {new Date(m.date).toLocaleDateString("en-PH", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                timeZone: "Asia/Manila",
                              })}
                            </div>
                          )}
                        </td>
                        <td />
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="tracking">Tracking No. ______________________</p>
              </div>
            </div>
          </>,

          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#a32020] disabled:opacity-50 cursor-pointer"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        Export TAF to PDF
      </button>

      {portal}
    </>
  );
}