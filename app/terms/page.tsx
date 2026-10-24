import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";
export const metadata = {
  title: "Terms & Conditions and Privacy Policy — AIThink",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-[#8B1A1A]">{title}</h2>
      <div className="space-y-2 leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
              <FileText className="h-4.5 w-4.5 text-[#8B1A1A]" />
            </span>
            <span className="text-lg font-bold text-[#333]">AIThink</span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#8B1A1A] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <article className="space-y-8 rounded-2xl border border-gray-200 bg-white p-6 text-sm shadow-sm sm:p-8">
          {}
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-bold text-[#333]">
              User Agreement and Terms of Service
            </h1>
            <p className="text-sm font-medium text-gray-500">AITHINK Platform</p>
          </header>

          {
}
          <div className="space-y-2 leading-relaxed text-gray-700">
            <p>
              AIThink is an institutional decision support system (DSS) for the
              College of Information and Computing Sciences (CICS) at Batangas
              State University TNEU – JPLPC Malvar. It helps student proponents
              draft, evaluate, and refine capstone topic proposals, enables
              capstone advisers to review submissions with interactive
              highlighting and comments, and provides executive evaluators with
              research analytics.
            </p>
            <p>
              By logging in, registering for, or using AIThink, you accept this
              User Agreement and acknowledge the Privacy Policy.
            </p>
          </div>

          <Section title="Your Account">
            <p>
              Accounts are created using your official university GSuite email
              address and SR-Code. Access permissions are controlled by
              Role-Based Access Control (RBAC):
            </p>
            <Bullets
              items={[
                "Student Proponents: Authorized to draft, review, and formally submit Topic Abstract Forms (TAFs) for adviser evaluation, view similarity scores, access AI-generated feedback, and browse Public Topic Overview.",
                "Capstone Advisers: Authorized to manage advisory groups through generated join codes, review/return/approve student TAF submissions, and leave highlighted annotations/comment.",
                "Executive Evaluators (Associate Dean, College Dean, VCRDES): Authorized to access analytics, review/return/approve student Topic Abstract Forms (TAFs), monitor SDGs and Field of IT of targeted topics and export reports.",
              ]}
            />
            <p>
              Keep your account details accurate. Keep your login credentials
              confidential. You are responsible for any activity done under your
              account. If you think someone else has accessed your account,
              notify your capstone instructor or system administrator right
              away.
            </p>
            <h3 className="pt-1 font-semibold text-gray-800">
              Drafts and Formal Submissions:
            </h3>
            <Bullets
              items={[
                "Draft Saved: Proposal text entered into the editor can be analyzed for similarity and AI-generated insights for five (5) times only. Drafts are saved to your account so you can retrieve and continue editing them at any time.",
                "Formal Submissions: When you formally submit your Topic Abstract Form (TAF) to your adviser, your proposal text and evaluation history are saved securely in the database for your adviser to review, comment on, and evaluate. Submitted proposals are stored purely for academic review and record-keeping.",
              ]}
            />
          </Section>

          <Section title="Similarity Scoring and Decision Support">
            <Bullets
              items={[
                "Similarity Calculation: The system calculates semantic overlap using Sentence-BERT vector embeddings. Matches at or below 20% similarity are treated as noise and count as zero; the remaining matches are then weighted by rank across the top 5 results — Top 1 at 40%, Top 2 at 25%, Top 3 at 15%, Top 4 at 12% and Top 5 at 8% (the weights are renormalized proportionally when fewer than five matches are found). The final score is the internal aggregate (50%) plus the external aggregate (50%).",
                "AI-Assisted: Google Gemini evaluates top-matched studies to suggest research gaps, UN Sustainable Development Goal (SDG) classifications, Field of IT, and topic improvements.",
                "Advisory Nature: AIThink is a decision support system, not an automated grading system. Similarity score and AI feedback are meant to guide users. Final approval of topics remains entirely with executive evaluators.",
              ]}
            />
          </Section>

          <Section title="Advisory groups and join codes">
            <p>
              Capstone advisers manage student advisees by creating advisory
              groups in the system. The system automatically generates a unique
              join code when a group is created. Advisers share this code with
              their students so they can join the group. Joining a group allows
              the assigned adviser to view and comment on your submitted TAF.
            </p>
          </Section>

          <Section title="Intellectual Property Rights">
            <Bullets
              items={[
                "Student Ownership: Students retain full intellectual property rights over their original research ideas, titles, objectives, and proposal content entered into AIThink.",
                "Internal System License: By formally submitting a TAF, students grant CICS permission to store, process, and convert their proposal text into vector embeddings solely for similarity checking.",
              ]}
            />
          </Section>

          <Section title="Prohibited Conduct">
            <p>Users agree to not engage in any of the following actions:</p>
            <Bullets
              items={[
                "Try to bypass or manipulate similarity scores by using text-obfuscation tricks, entering random text, or using prompt injection inputs;",
                "Pretend to be someone else or use another user's account session;",
                "Try to access pages, database tables, or advisory groups outside your assigned role;",
                "Send automated traffic intended to overload Next.js server actions or database endpoints;",
                "Submit plagiarized content or violate university academic integrity policies.",
              ]}
            />
          </Section>

          <Section title="Limitation of Liability and System Disclaimers">
            <Bullets
              items={[
                "As-Is Provision: AIThink is provided on an \u201cas-is\u201d and \u201cas-available\u201d basis for educational and decision-support purposes within Batangas State University TNEU. The development team and CICS make no warranties regarding uninterrupted server uptime or error-free operation.",
                "No Financial Liability: Because AIThink is provided free of charge to university students, faculty, and administrators, the development team, CICS, and the University shall not be liable for any monetary claims or indirect costs arising from system usage.",
                "Academic Decision Disclaimer: Similarity metrics and qualitative AI outputs serve strictly as decision-support tools. The development team and the platform are not liable for academic outcomes, including topic rejections or required revisions.",
                "Third-Party API Outages: AIThink relies on external service providers (Google Gemini API and SerpAPI). The development team is not liable for temporary feature disruptions, rate limits, or search delays caused by external API outages or scheduled university server maintenance.",
              ]}
            />
          </Section>

          <Section title="Availability and changes">
            <p>
              AIThink is provided as an academic university service. System
              features may change, database indexes may be updated, or the
              system may occasionally be unavailable during maintenance. If this
              User Agreement is updated, this page will be updated.
            </p>
          </Section>

          <Section title="For questions regarding this agreement">
            <p>
              Feel free to contact the College of Informatics and Computing
              Sciences.
            </p>
          </Section>

          {}
          <header className="space-y-1 border-t pt-8">
            <h1 className="text-2xl font-bold text-[#333]">Privacy Policy</h1>
            <p className="text-sm font-medium text-gray-500">
              Updated on 19 October 2026
            </p>
          </header>

          <Section title="About this Policy">
            <p>
              This Privacy Policy explains how AIThink collects, uses, protects,
              and retains information provided by student proponents, capstone
              advisers, and executive evaluators at Batangas State University
              TNEU – JPLPC Malvar Campus.
            </p>
          </Section>

          <Section title="Information We Collect">
            <Bullets
              items={[
                "Account and Identification Data: Your full name, university GSuite email address, SR-Code, and assigned user role (department, student, adviser, dean, associate_dean, vcrdes).",
                "Student Proposal Content: Content submitted through the Topic Abstract Form (titles, backgrounds, objectives, review of related literatures, methodologies, and references).",
                "CICS Journals: Past capstone journal PDF files uploaded strictly by the department account to maintain the internal similarity reference.",
                "Review and collaboration: Group join codes created by capstone advisers, student group records, and comments left on submitted TAFs.",
              ]}
            />
          </Section>

          <Section title="Account and Security Records">
            <Bullets
              items={[
                "Records of key actions taken, such as account creation, user log-in and log-out, submitting and deleting a TAF, and leaving an advisory group.",
              ]}
            />
          </Section>

          <Section title="How We Use Your Information">
            <Bullets
              items={[
                "To log you in securely and restrict access according to your assigned RBAC permissions.",
                "To save your drafts so you can retrieve, edit, and re-analyze your work anytime.",
                "To calculate similarity scores and generate feedback for your topic.",
                "To allow evaluators to review assigned student TAFs leave feedback, and approve/return decisions.",
                "For executive evaluators with departmental reports on research trends, SDG alignment, and field of IT.",
              ]}
            />
          </Section>

          <Section title="Document Parsing and AI processing">
            <p>
              When the CICS department uploads completed journal PDFs to populate
              the repository, AIThink reads the text using pdfjs-dist. If a PDF
              is a scanned image with fewer than 50 readable characters, local
              Tesseract.js Optical Character Recognition (OCR) extracts the text
              inside the server environment.
            </p>
          </Section>

          <Section title="Vector Embeddings">
            <p>
              Text from proposals and repository journals is converted into
              384-dimensional vector embeddings using Sentence-BERT running
              locally on the server CPU.
            </p>
          </Section>

          <Section title="External API Processing">
            <p>
              To search external literature, query parameters are sent securely
              server-side to SerpAPI (Google Scholar). To generate gap analysis
              and recommendations, proposal text and top-matched studies are
              sent securely to the Google Gemini API.
            </p>
          </Section>

          <Section title="Who Can See Your Information">
            <Bullets
              items={[
                "You: Can see your own profile, saved drafts, submitted TAFs, similarity reports, 5-attempt usage counter, and evaluator comments.",
                "Capstone Advisers: Can only view students who joined their group through join code. Advisers can view submitted TAFs, similarity scores, AI feedback, and leave comments. Advisers cannot view your unsubmitted drafts.",
                "Executive Evaluators: Can view submitted TAFs across the department, evaluate/approve topics, and access analytics.",
                "Other Students: Can browse the Public Topic Overview to view low-similarity, submitted, and approved topic overviews (Title, Summary, SDG Alignment, and IT Field). Students cannot view another student's all contents of TAF, personal account details, or evaluator comments.",
              ]}
            />
            <p>
              AIThink does not sell personal information or display commercial
              advertising.
            </p>
          </Section>

          <Section title="Data Accuracy">
            <p>
              Students can edit draft content prior to submission. Account
              details (SR-Code, Name, Email) are synchronized through Gsuite
              authentication; contact CICS administration if profile details
              require correction.
            </p>
          </Section>

          <Section title="For privacy inquiries">
            <p>
              Feel free to contact the College of Informatics and Computing
              Sciences.
            </p>
          </Section>
        </article>

        <div className="mt-6 text-center text-sm text-gray-500">
          <Link href="/login" className="font-medium text-[#660111] hover:underline">
            Back to Login
          </Link>
        </div>
      </main>
    </div>
  );
}