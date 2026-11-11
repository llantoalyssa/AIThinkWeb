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

const GRAY = "#F2F2F2";

export default function TafFormExport({ submission }: Props) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);

    setTimeout(() => {
      window.print();
      setExporting(false);
    }, 50);
  }

  const snap = submission.tafSnapshot || {};

  const fields: {
    label: string;
    value: string;
    gray: boolean;

    boldValue?: boolean;
    style?: "references";
  }[] = [
    {
      label: "Proposed Title:",
      value: snap.proposedTitle || "",
      gray: false,
      boldValue: true,
    },
    {
      label: "Background of the Proposed Topic:",
      value: snap.background || "",
      gray: true,
    },
    {
      label: "General Objectives:",
      value: snap.objectives || "",
      gray: true,
    },
    {
      label: "Review of Related Literatures:",
      value: snap.literatureReview || "",
      gray: false,
    },
    {
      label: "Research Methodology:",
      value: snap.methodology || "",
      gray: true,
    },
    {
      label: "References:",
      value: snap.referenceList || "",
      gray: false,
      style: "references",
    },
  ];

  const proponents =
    submission.groupMembers && submission.groupMembers.length > 0
      ? submission.groupMembers
      : [submission.studentName || "—"];

  const committee = COMMITTEE_ORDER.map((role) => {
    const step = (submission.approverSteps || []).find((s) => s.role === role);
    const approved = step?.status === "approved";
    return {
      role,
      position: COMMITTEE_POSITIONS[role] ?? step?.label ?? role,
      name: approved && step?.actorName ? step.actorName : "",
      acting: approved ? Boolean(step?.standIn) : false,
    };
  });

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @media print {
                body > *:not(#taf-pdf-export) { display: none !important; }
                @page { size: 8.5in 13in; margin: 1in; }

                #taf-pdf-export {
                  display: block !important;
                  padding: 0;
                  box-sizing: border-box;
                  font-family: "Times New Roman", Times, serif;
                  font-size: 12pt;
                  line-height: 1.35;
                  color: #000;
                  print-color-adjust: exact;
                  -webkit-print-color-adjust: exact;
                }

                #taf-pdf-export .seal {
                  width: 0.72in; height: 0.72in;
                  object-fit: contain;
                  display: inline-block;
                  vertical-align: middle;
                }

                #taf-pdf-export table {
                  width: 100%; border-collapse: collapse;
                  table-layout: fixed;
                }
                #taf-pdf-export td, #taf-pdf-export th {
                  border: 0.5pt solid #000;
                  padding: 3pt 5pt;
                  vertical-align: top;
                  font-size: 12pt;
                }
                #taf-pdf-export .gray { background: ${GRAY}; }

                #taf-pdf-export .ref { font-size: 10pt; line-height: 1.35; }
                #taf-pdf-export .lbl { font-size: 12pt; }
                #taf-pdf-export .lbl-bold { font-size: 12pt; font-weight: 700; }
                #taf-pdf-export .form-title {
                  font-weight: 700; font-size: 12pt; text-align: center;
                  letter-spacing: .04em;
                }
                #taf-pdf-export .field {
                  break-inside: auto; page-break-inside: auto;
                }
                #taf-pdf-export .field-label {
                  font-weight: 700; margin: 0 0 2pt 0;
                  break-after: avoid; page-break-after: avoid;
                }
                #taf-pdf-export .field-label-plain { font-weight: 400; }

                #taf-pdf-export p, #taf-pdf-export li {
                  font-size: 12pt; line-height: 1.35; color: #000;
                  text-align: justify;
                  overflow-wrap: anywhere; word-break: break-word;
                  margin: 0 0 2pt 0;
                  orphans: 2; widows: 2;
                }
                #taf-pdf-export .bold-value, #taf-pdf-export .bold-value p {
                  font-weight: 700;
                }
                #taf-pdf-export ul, #taf-pdf-export ol {
                  margin: 2pt 0; padding-left: 22pt;
                }
                #taf-pdf-export li { margin: 1pt 0; }
                #taf-pdf-export .doc-references p {
                  font-size: 12pt; text-align: left;
                  padding-left: 24pt; text-indent: -24pt; margin: 0 0 3pt 0;
                }

                #taf-pdf-export .committee-head {
                  font-size: 12pt; font-weight: 400; text-align: center;
                  margin: 0 0 2pt 0;
                }
                #taf-pdf-export .committee-note {
                  font-size: 12pt; font-weight: 400; text-align: center;
                  margin: 0;
                }
                #taf-pdf-export .committee th {
                  font-size: 12pt; font-weight: 700; text-align: center;
                  padding: 3pt 5pt;
                }
                #taf-pdf-export .committee td {
                  height: 0.62in; vertical-align: middle; text-align: center;
                  padding: 3pt 5pt;
                }
                #taf-pdf-export .sign-name {
                  font-size: 11pt; font-weight: 700; text-align: center;
                }
                #taf-pdf-export .sign-pos {
                  font-size: 11pt; font-weight: 400; text-align: center;
                  line-height: 1.3;
                }

                #taf-pdf-export .tracking {
                  font-size: 10pt; font-style: italic; margin-top: 10pt;
                }
                #taf-pdf-export .committee tr {
                  break-inside: avoid; page-break-inside: avoid;
                }
              }
              @media screen {
                #taf-pdf-export { display: none !important; }
              }
            `}</style>

            <div id="taf-pdf-export">
              <table>
                <colgroup>
                  <col style={{ width: "17.1%" }} />
                  <col style={{ width: "33.5%" }} />
                  <col style={{ width: "38.6%" }} />
                  <col style={{ width: "10.8%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    {}
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      {}
                      <img
                        className="seal"
                        src="/batstateu-seal.png"
                        alt="Batangas State University"
                      />
                    </td>
                    <td className="ref" style={{ verticalAlign: "middle" }}>
                      Reference No.: BatStateU-FO-COL-03
                    </td>
                    <td className="ref" style={{ verticalAlign: "middle" }}>
                      Effectivity Date: January 3, 2017
                    </td>
                    <td className="ref" style={{ verticalAlign: "middle" }}>
                      Revision No.: 00
                    </td>
                  </tr>
                </tbody>
              </table>

              <table style={{ marginTop: "-0.5pt" }}>
                <colgroup>
                  <col style={{ width: "17.1%" }} />
                  <col style={{ width: "82.9%" }} />
                </colgroup>
                <tbody>
                  <tr className="gray">
                    <td className="lbl-bold">Title:</td>
                    <td className="form-title">TOPIC ABSTRACT FORM</td>
                  </tr>
                  <tr>
                    <td className="lbl">College</td>
                    <td className="lbl">
                      College of Informatics and Computing Sciences
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">Proponents</td>
                    <td className="lbl">
                      {proponents.map((name, i) => (
                        <div key={`${name}-${i}`}>{name}</div>
                      ))}
                    </td>
                  </tr>
                  <tr>
                    {
}
                    <td className="lbl">Program</td>
                    <td className="lbl">&nbsp;</td>
                  </tr>
                </tbody>
              </table>

              {}
              <table style={{ marginTop: "-0.5pt" }}>
                <colgroup>
                  <col style={{ width: "100%" }} />
                </colgroup>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.label} className={f.gray ? "gray" : undefined}>
                      <td className="field">
                        <p
                          className={`field-label${
                            f.boldValue ? "" : " field-label-plain"
                          }`}
                        >
                          {f.label}
                        </p>
                        {f.value ? (
                          <div
                            className={[
                              f.style === "references" ? "doc-references" : "",
                              f.boldValue ? "bold-value" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            dangerouslySetInnerHTML={{
                              __html: plainTextToHtml(f.value, { style: f.style }),
                            }}
                          />
                        ) : (
                          <p>—</p>
                        )}
                      </td>
                    </tr>
                  ))}

                  {}
                  <tr className="gray">
                    <td>
                      <p className="committee-head">TOPIC EVALUATION COMMITTEE</p>
                      <p className="committee-note">
                        The topic abstract has been thoroughly reviewed by the
                        Topic Evaluation Committee.
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {}
              <table className="committee" style={{ marginTop: "-0.5pt" }}>
                <colgroup>
                  <col style={{ width: "42.4%" }} />
                  <col style={{ width: "19.4%" }} />
                  <col style={{ width: "38.2%" }} />
                </colgroup>
                <thead>
                  <tr className="gray">
                    <th />
                    <th>Signature</th>
                    <th>Remarks</th>
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
                      </td>
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="tracking">Tracking No. ____________</p>
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