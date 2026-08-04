/**
 * Escapes text for safe inclusion inside an HTML text node or attribute.
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Escapes text for safe inclusion inside a HTML <textarea> body.
 * Also neutralizes a literal closing textarea tag sequence.
 */
export function escapeTextareaContent(text: string): string {
    return escapeHtml(text).replace(/&lt;\/textarea/gi, "&lt;&#47;textarea");
}
