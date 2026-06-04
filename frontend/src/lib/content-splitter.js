/**
 * Splits HTML into pages by extracting each .page[data-page] div's innerHTML.
 * Uses DOMParser to avoid cutting mid-tag; skips the outer wrapper.
 * Falls back to <hr> splits, then single page.
 */
export function splitHtml(html) {
  if (!html) return [''];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageDivs = doc.querySelectorAll('.page[data-page]');
  if (pageDivs.length > 0) {
    return Array.from(pageDivs).map((div) => div.innerHTML);
  }
  const byHr = html.split(/<hr\s*\/?>/i).filter((s) => s.trim());
  if (byHr.length > 1) return byHr;
  return [html];
}

/**
 * Splits Markdown into reader pages.
 * Splits by --- horizontal rules first; otherwise chunks by ~500 words.
 */
export function splitMarkdown(markdown) {
  if (!markdown) return [''];
  const byHr = markdown.split(/\n---+\n/);
  if (byHr.length > 1) return byHr.filter((s) => s.trim());

  const paragraphs = markdown.split(/\n\n+/);
  const pages = [];
  let page = '';
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).length;
    if (wordCount + words > 500 && page) {
      pages.push(page.trim());
      page = para + '\n\n';
      wordCount = words;
    } else {
      page += para + '\n\n';
      wordCount += words;
    }
  }
  if (page.trim()) pages.push(page.trim());
  return pages.length ? pages : [markdown];
}
