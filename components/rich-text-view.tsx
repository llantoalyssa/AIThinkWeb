import { cn } from "@/lib/utils";
import { looksLikeHtml, plainTextToHtml } from "@/lib/html";

type Props = {
  html: string | null | undefined;
  className?: string;
  maxHeight?: string;
  fallback?: string;
  plainTextStyle?: "prose" | "references";
};

export default function RichTextView({
  html,
  className,
  maxHeight,
  fallback = "—",
  plainTextStyle,
}: Props) {
  if (!html) {
    return <p className={cn("text-sm text-[#333]", className)}>{fallback}</p>;
  }
  const content = looksLikeHtml(html)
    ? html
    : plainTextToHtml(html, { style: plainTextStyle });

  return (
    <div
      className={cn("rich-text-content", className)}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}