export function escapeMarkdown(text?: string) {
  if (!text) return text
  const specialChars = ["_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!", "\\"]

  const createEscapeRegex = (chars: string[]) => new RegExp(`([${chars.map((c) => c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("")}])`, "g")

  const ESCAPE_RE = createEscapeRegex(specialChars)
  const escapeAll = (s: string) => s.replace(ESCAPE_RE, "\\$1")
  return escapeAll(text)
}
