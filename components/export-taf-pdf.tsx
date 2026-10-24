"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import type { SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import { plainTextToHtml } from "@/lib/html";

type Props = {
  submission: SubmissionWithAnalysis;
};

export default function ExportTafPdf({ submission }: Props) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);

    setTimeout(() => {
      window.print();
      setExporting(false);
    }, 50);
  }

  const snap = submission.tafSnapshot || {};
  const sections: {
    label: string;
    value: string;

    style?: "references";
  }[] = [
    { label: "Background of the Proposed Topic", value: snap.background || "" },
    { label: "General & Specific Objectives", value: snap.objectives || "" },
    { label: "Review of Related Literature", value: snap.literatureReview || "" },
    { label: "Methodology", value: snap.methodology || "" },
    { label: "References", value: snap.referenceList || "", style: "references" },
  ];
  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <>
            <style>{`
              @media print {
                body > *:not(#taf-pdf-export) { display: none !important; }
                #taf-pdf-export { display: block !important; font-family: Georgia, "Times New Roman", Cambria, serif; color: #111; }

                #taf-pdf-export h1 {
                  font-size: 17px; font-weight: 700; text-align: center;
                  line-height: 1.4; margin: 0 0 4px;
                }

                #taf-pdf-export h2 {
                  font-size: 12.5px; font-weight: 700; text-transform: uppercase;
                  letter-spacing: .04em; color: #7a1f1f;
                  margin: 16px 0 6px; padding-bottom: 3px;
                  border-bottom: 1px solid #d9d9d9;
                  break-after: avoid; page-break-after: avoid;
                }
                #taf-pdf-export p,
                #taf-pdf-export li {
                  font-size: 12px; line-height: 1.75; color: #111;
                  text-align: justify; hyphens: auto;
                }
                #taf-pdf-export p { margin: 0 0 4px; text-indent: 24px; }
                #taf-pdf-export section > div > p:first-child { text-indent: 0; }

                #taf-pdf-export ul,
                #taf-pdf-export ol { margin: 4px 0 10px; padding-left: 26px; }
                #taf-pdf-export ul { list-style: disc outside; }
                #taf-pdf-export ol { list-style: decimal outside; }
                #taf-pdf-export li {
                  margin: 3px 0;
                  break-inside: avoid; page-break-inside: avoid;
                }
                #taf-pdf-export li p,
                #taf-pdf-export li > p { text-indent: 0; margin: 0; }
                #taf-pdf-export .doc-references p {
                  font-size: 11.5px; text-align: left;
                  padding-left: 26px; text-indent: -26px;
                  margin: 0 0 5px;
                }

                @page { margin: 20mm 18mm; }
              }
              @media screen {
                #taf-pdf-export { display: none !important; }
              }
            `}</style>
            <div id="taf-pdf-export">
              <h1>{snap.proposedTitle || "Untitled TAF"}</h1>
              {sections.map((s) => (
                <section key={s.label}>
                  <h2>{s.label}</h2>
                  {s.value ? (
                    <div
                      className={s.style === "references" ? "doc-references" : undefined}
                      dangerouslySetInnerHTML={{
                        __html: plainTextToHtml(s.value, { style: s.style }),
                      }}
                    />
                  ) : (
                    <p>—</p>
                  )}
                </section>
              ))}
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
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
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