"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import type { SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import { looksLikeHtml, plainTextToHtml } from "@/lib/html";

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
function FieldValue({ value }: { value: string }) {
  if (!value) return <>—</>;

  if (looksLikeHtml(value)) {
    return <div dangerouslySetInnerHTML={{ __html: value }} />;
  }

  return <div className="plain-block">{value}</div>;
}
function proponentName(m: {
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  suffix: string | null;
}) {
  const mi = (m.middleInitial || "").replace(/\.$/, "");
  const middle = mi ? ` ${mi}.` : "";
  const suffix = m.suffix ? ` ${m.suffix}` : "";
  return `${m.lastName}, ${m.firstName}${middle}${suffix}`;
}

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
    variant: "wholeGray" | "labelBar" | "plain" | "compact";

    indented?: boolean;
    style?: "references";
  }[] = [
    {
      label: "Background of the Proposed Topic:",
      value: snap.background || "",
      variant: "wholeGray",
      indented: true,
    },
    {
      label: "General Objectives:",
      value: snap.objectives || "",
      variant: "labelBar",
      indented: true,
    },
    {
      label: "Review of Related Literatures:",
      value: snap.literatureReview || "",
      variant: "plain",
      indented: true,
    },
    {
      label: "Research Methodology:",
      value: snap.methodology || "",
      variant: "labelBar",
      indented: true,
    },
    {
      label: "References:",
      value: snap.referenceList || "",
      variant: "compact",
      style: "references",
    },
  ];
  const proponents = [...(submission.groupMembers || [])].sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName),
  );

  const committee = COMMITTEE_ORDER.map((role) => {
    const step = (submission.approverSteps || []).find((s) => s.role === role);
    const approved = step?.status === "approved";

    return {
      role,
      position: COMMITTEE_POSITIONS[role] ?? step?.label ?? role,
      name:
        approved && step?.actorName
          ? step.actorName.toUpperCase()
          : "______________________________",
      acting: approved && step?.standIn ? " (ACTING)" : "",
    };
  });

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @media print {
                @page {
                  size: 21.59cm 33.02cm;
                  margin: 2cm;
                }

                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #fff !important;
                  display: block !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }

                body > *:not(#taf-pdf-export) { display: none !important; }

                #taf-pdf-export {
                  display: block !important;
                  width: 100%;
                  font-family: "Times New Roman", Times, serif;
                  color: #000;
                  background: #fff !important;
                  box-sizing: border-box;
                }

                .taf-container {
                  width: 100%;
                  padding-top: 2mm;
                  box-sizing: border-box;
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                }
                #taf-pdf-export table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 0;
                  table-layout: fixed;
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                }

                #taf-pdf-export thead,
                #taf-pdf-export tbody,
                #taf-pdf-export tr,
                #taf-pdf-export th,
                #taf-pdf-export td {
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                }

                #taf-pdf-export th,
                #taf-pdf-export td {
                  border: 0.4px solid #000;
                  padding: 6px 8px;
                  vertical-align: top;
                  font-size: 12pt;
                }

                #taf-pdf-export .gray-bg { background-color: #f0f0f0 !important; }
                #taf-pdf-export .fields-container {
                  width: 100%;
                  box-sizing: border-box;
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                }

                #taf-pdf-export .field-section {
                  display: block;
                  width: 100%;
                  box-sizing: border-box;
                  border: 0.4px solid #000 !important;
                  padding: 6px 8px;
                  margin: 0;
                  height: auto !important;
                  min-height: 0 !important;
                  max-height: none !important;
                  overflow: visible !important;
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                  -webkit-box-decoration-break: clone;
                  box-decoration-break: clone;
                }
                #taf-pdf-export .fields-container > .field-section:first-child {
                  border-top: 0 !important;
                }
                #taf-pdf-export .field-section + .field-section {
                  border-top: 0 !important;
                  margin-top: 0;
                }

                #taf-pdf-export .field-section.no-pad { padding: 0 !important; }
                #taf-pdf-export .field-section.gray-bg {
                  background-color: #f0f0f0 !important;
                }

                #taf-pdf-export .field-section > div,
                #taf-pdf-export .field-content,
                #taf-pdf-export .pad-content,
                #taf-pdf-export .indented-content,
                #taf-pdf-export .doc-references,
                #taf-pdf-export .proposed-title-content,
                #taf-pdf-export p,
                #taf-pdf-export li,
                #taf-pdf-export ul,
                #taf-pdf-export ol {
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                }
                #taf-pdf-export .field-section .field-label,
                #taf-pdf-export .field-section .pad-label {
                  page-break-after: avoid !important;
                  break-after: avoid !important;
                }
                #taf-pdf-export .text-center { text-align: center; }
                #taf-pdf-export .text-left { text-align: left; }
                #taf-pdf-export .align-middle { vertical-align: middle; }
                #taf-pdf-export .bold { font-weight: bold; }
                #taf-pdf-export .no-pad { padding: 0 !important; }

                #taf-pdf-export .pad-label {
                  padding: 6px 8px;
                  font-weight: bold;
                  display: block;
                }

                #taf-pdf-export .pad-content { padding: 6px 8px; }
                #taf-pdf-export .form-title {
                  font-weight: bold;
                  text-align: center;
                  font-size: 13pt;
                  letter-spacing: 0.05em;
                  vertical-align: middle;
                }

                #taf-pdf-export .field-label {
                  font-weight: bold;
                  margin-bottom: 5px;
                  display: block;
                  font-size: 12pt;
                }

                #taf-pdf-export .field-content,
                #taf-pdf-export .large-field,
                #taf-pdf-export .xl-field {
                  min-height: 0 !important;
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                }

                #taf-pdf-export .proposed-title-content,
                #taf-pdf-export .proposed-title-content * {
                  text-align: center !important;
                  font-weight: bold !important;
                }

                #taf-pdf-export .proposed-title-content p { margin: 0; }
                #taf-pdf-export .indented-content p {
                  text-indent: 0 !important;
                }

                #taf-pdf-export .field-content,
                #taf-pdf-export .pad-content,
                #taf-pdf-export .indented-content,
                #taf-pdf-export .proposed-title-content,
                #taf-pdf-export .doc-references {
                  line-height: 1.5 !important;
                }

                #taf-pdf-export .ref-text {
                  font-size: 10pt !important;
                  line-height: 1.3;
                }

                #taf-pdf-export .tracking-wrapper {
                  font-size: 10pt !important;
                  line-height: 1.3;
                  text-align: right;
                  font-style: italic;
                  padding-right: 15px;
                  margin-top: 15px;
                }
                #taf-pdf-export .proponents-list {
                  display: block;
                }

                #taf-pdf-export .proponent-name {
                  font-size: 12pt;
                  line-height: 1.35;
                }
                #taf-pdf-export .committee-title {
                  display: block;
                  font-size: 12pt;
                  font-weight: normal;
                  margin: 0;
                  padding: 0;
                  text-align: center;
                  line-height: 1;
                }

                #taf-pdf-export .committee-subtitle {
                  display: block;
                  font-size: 11pt;
                  font-weight: normal;
                  margin: 0;
                  padding: 0;
                  text-align: center;
                  line-height: 1;
                }

                #taf-pdf-export .name-cell {
                  text-align: center;
                  vertical-align: middle;
                  height: 60px;
                  padding: 8px;
                }

                #taf-pdf-export .name-text {
                  font-weight: bold;
                  font-size: 11pt !important;
                  margin-bottom: 4px;
                }

                #taf-pdf-export .pos-text {
                  font-size: 12pt !important;
                  line-height: 1.25;
                }

                #taf-pdf-export .committee-headers td { font-size: 11pt !important; }

                #taf-pdf-export .committee-table {
                  margin-top: -1px;
                  border-collapse: collapse;
                  width: 100%;
                }

                #taf-pdf-export .committee-table,
                #taf-pdf-export .committee-table td,
                #taf-pdf-export .committee-table div,
                #taf-pdf-export .committee-table span,
                #taf-pdf-export .committee-table p {
                  line-height: 1 !important;
                }

                #taf-pdf-export .committee-table p { margin-bottom: 0 !important; }
                #taf-pdf-export p,
                #taf-pdf-export li,
                #taf-pdf-export .field-content,
                #taf-pdf-export .pad-content,
                #taf-pdf-export .indented-content,
                #taf-pdf-export .doc-references {
                  text-align: justify !important;
                  text-justify: inter-word;
                  font-size: 11.5pt;
                  line-height: 1.5 !important;
                  color: #000;
                  hyphens: none !important;
                  -webkit-hyphens: none !important;
                  -ms-hyphens: none !important;
                  overflow-wrap: break-word;
                  word-wrap: break-word;
                }

                #taf-pdf-export .field-content *,
                #taf-pdf-export .pad-content *,
                #taf-pdf-export .indented-content *,
                #taf-pdf-export .doc-references * {
                  text-align: justify !important;
                  hyphens: none !important;
                  -webkit-hyphens: none !important;
                }

                #taf-pdf-export p,
                #taf-pdf-export li {
                  margin: 0 0 4px;
                  orphans: 2;
                  widows: 2;
                }
                #taf-pdf-export ul,
                #taf-pdf-export ol {
                  margin: 0.35em 0 0.8em;
                  padding-left: 1.8em;
                }

                #taf-pdf-export li {
                  display: list-item !important;
                  margin: 0.25em 0;
                  text-align: justify;
                }

                #taf-pdf-export ul {
                  list-style: disc outside !important;
                }

                #taf-pdf-export ul ul {
                  list-style: circle outside !important;
                }

                #taf-pdf-export ol {
                  list-style: decimal outside !important;
                }

                #taf-pdf-export ol ol {
                  padding-left: 1.8em;
                }
                #taf-pdf-export .field-content p {
                  text-indent: 2em !important;
                  margin: 0 0 0.35em !important;
                }
                #taf-pdf-export .field-content > p:first-child,
                #taf-pdf-export .field-content > div > p:first-child,
                #taf-pdf-export .field-content li p,
                #taf-pdf-export .field-content li > p {
                  text-indent: 0 !important;
                }
                #taf-pdf-export .field-content p,
                #taf-pdf-export .field-content li,
                #taf-pdf-export .field-content h1,
                #taf-pdf-export .field-content h2,
                #taf-pdf-export .field-content h3,
                #taf-pdf-export .field-content h4,
                #taf-pdf-export .field-content blockquote,
                #taf-pdf-export .field-content td,
                #taf-pdf-export .field-content th {
                  white-space: pre-wrap !important;
                }
                #taf-pdf-export li > p:first-of-type {
                  display: inline !important;
                  margin: 0 !important;
                  text-indent: 0 !important;
                }

                #taf-pdf-export li p {
                  margin: 0 !important;
                  text-indent: 0 !important;
                }
                #taf-pdf-export .doc-references p,
                #taf-pdf-export .doc-references p.doc-ref {
                  font-size: 11pt !important;
                  text-align: left !important;
                  padding-left: 0 !important;
                  margin-left: 0 !important;
                  text-indent: 0 !important;
                  margin-bottom: 4px !important;
                  line-height: 1.5 !important;
                }
                #taf-pdf-export .field-content .plain-block,
                #taf-pdf-export .doc-references .plain-block,
                #taf-pdf-export .plain-block {
                  white-space: pre-wrap !important;
                  text-align: left !important;
                  font-size: 11.5pt;
                  line-height: 1.5;
                  margin: 0;
                  page-break-inside: auto !important;
                  break-inside: auto !important;
                  overflow-wrap: break-word;
                  hyphens: none !important;
                  -webkit-hyphens: none !important;
                }
                #taf-pdf-export .proposed-title-content,
                #taf-pdf-export .proposed-title-content * {
                  text-align: center !important;
                  font-weight: bold !important;
                }
                #taf-pdf-export .form-title,
                #taf-pdf-export .committee-title,
                #taf-pdf-export .committee-subtitle {
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
              }

              @media screen {
                #taf-pdf-export { display: none !important; }
              }
            `}</style>

            <div id="taf-pdf-export">
              <div className="taf-container">
                {}
                <table>
                  <colgroup>
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "35%" }} />
                    <col style={{ width: "37%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>

                  <tbody>
                    <tr>
                      <td className="text-center align-middle">
                        {}
                        <img
                          src="/batstateu-seal.png"
                          alt="Batangas State University"
                          style={{
                            width: "55px",
                            height: "55px",
                            objectFit: "contain",
                            margin: "0 auto",
                          }}
                        />
                      </td>

                      <td className="align-middle ref-text">
                        Reference No.: BatStateU-FO-COL-03
                      </td>

                      <td className="align-middle ref-text">
                        Effectivity Date: January 3, 2017
                      </td>

                      <td className="align-middle ref-text text-left">
                        Revision
                        <br />
                        No.: 00
                      </td>
                    </tr>

                    <tr className="gray-bg">
                      <td
                        colSpan={4}
                        className="form-title"
                        style={{ padding: "8px" }}
                      >
                        <span style={{ float: "left", fontWeight: "bold" }}>
                          Title:
                        </span>
                        <span>TOPIC ABSTRACT FORM</span>
                      </td>
                    </tr>

                    <tr>
                      <td>College</td>
                      <td colSpan={3}>
                        College of Informatics and Computing Sciences
                      </td>
                    </tr>

                    <tr>
                      <td>Proponents</td>
                      <td colSpan={3}>
                        {proponents.length > 0 ? (
                          <div className="proponents-list">
                            {proponents.map((p, i) => (
                              <div
                                key={`${p.lastName}-${p.firstName}-${i}`}
                                className="proponent-name"
                              >
                                {proponentName(p)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="proponent-name">
                            {submission.studentName || "—"}
                          </div>
                        )}
                      </td>
                    </tr>

                    <tr>
                      {
}
                      <td>Program</td>
                      <td colSpan={3}>&nbsp;</td>
                    </tr>

                    {}
                    <tr>
                      <td colSpan={4} style={{ borderRight: "none" }}>
                        <span
                          className="field-label"
                          style={{ fontWeight: "normal" }}
                        >
                          Proposed Title:
                        </span>

                        <div className="field-content proposed-title-content">
                          {snap.proposedTitle ? (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: plainTextToHtml(
                                  `"${snap.proposedTitle}"`,
                                ),
                              }}
                            />
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {}
                <div className="fields-container">
                  {fields.map((field) => (
                    <div
                      key={field.label}
                      className={`field-section ${
                        field.variant === "wholeGray"
                          ? "gray-bg"
                          : field.variant === "labelBar"
                            ? "no-pad"
                            : field.variant === "plain"
                              ? "large-field"
                              : ""
                      }`}
                    >
                      {field.variant === "labelBar" ? (
                        <>
                          {}
                          <div className="pad-label gray-bg">{field.label}</div>
                          <div className="pad-content field-content indented-content">
                            <FieldValue value={field.value} />
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="field-label">{field.label}</span>
                          <div
                            className={`field-content${
                              field.indented ? " indented-content" : ""
                            }`}
                          >
                            {field.style === "references" ? (
                              <div className="doc-references">
                                <FieldValue value={field.value} />
                              </div>
                            ) : (
                              <FieldValue value={field.value} />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {}
                <table className="committee-table">
                  <colgroup>
                    <col style={{ width: "45%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "37%" }} />
                  </colgroup>

                  <tbody>
                    <tr>
                      <td
                        colSpan={3}
                        className="gray-bg"
                        style={{ padding: "8px" }}
                      >
                        <span className="committee-title">
                          TOPIC EVALUATION COMMITTEE
                        </span>

                        <span className="committee-subtitle">
                          The topic abstract has been thoroughly reviewed by the
                          Topic Evaluation Committee.
                        </span>
                      </td>
                    </tr>

                    <tr className="gray-bg text-center bold committee-headers">
                      <td className="align-middle">&nbsp;</td>
                      <td className="align-middle">Signature</td>
                      <td className="align-middle">Remarks</td>
                    </tr>

                    {committee.map((member) => (
                      <tr key={member.role}>
                        <td className="name-cell">
                          <div className="name-text">
                            {member.name}
                            {member.acting}
                          </div>

                          <div className="pos-text">{member.position}</div>
                        </td>

                        <td />

                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="tracking-wrapper">
                  Tracking No. _________________
                </div>
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