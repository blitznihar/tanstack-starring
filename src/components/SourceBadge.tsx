function formatSourceLabel(source?: string | null): string {
  const value = source?.trim() || "generated";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SourceBadge({ source, tone = "admin" }: { source?: string | null; tone?: "admin" | "student" }) {
  const label = formatSourceLabel(source);
  return (
    <span className={`source-badge source-badge-${tone}`} title={`Source: ${label}`}>
      {label}
    </span>
  );
}
