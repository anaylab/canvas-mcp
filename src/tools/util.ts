/** Shared helpers for tool handlers. */

export function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

export function fail(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: `Error ${action}: ${message}` }],
    isError: true as const,
  };
}

/** Canvas returns HTML bodies; models read plain text far better. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return !text || text === href || href.startsWith('#') || href.startsWith('javascript:') ? text : `${text} (${href})`;
    })
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract text from a PDF. `unpdf` is an optional dependency (needs Node 22+),
 * so a missing module yields null and callers fall back to a download link.
 */
interface UnPdf {
  getDocumentProxy(data: Uint8Array): Promise<unknown>;
  extractText(pdf: unknown, options: { mergePages: true }): Promise<{ text: string }>;
}

export async function pdfToText(bytes: Uint8Array): Promise<string | null> {
  if (Number(process.versions.node.split('.')[0]) < 22) return null;
  let mod: UnPdf;
  try {
    // Specifier in a variable: the module is optional, so it must not be resolved at compile time.
    const name = 'unpdf';
    mod = (await import(name)) as UnPdf;
  } catch {
    return null;
  }
  const pdf = await mod.getDocumentProxy(new Uint8Array(bytes));
  const { text } = await mod.extractText(pdf, { mergePages: true });
  return text.trim();
}
