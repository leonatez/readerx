import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBooks } from '@/hooks/use-books';
import { Button } from '@/components/ui/button';

/**
 * Split HTML into pages by extracting each .page[data-page] div's innerHTML.
 * Uses DOMParser so we never cut mid-tag and skip the outer wrapper div.
 * Falls back to <hr> splits, then single page.
 */
function splitHtml(html) {
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
 * Split Markdown into reader pages.
 * Splits by --- horizontal rules first; otherwise chunks by ~500 words.
 */
function splitMarkdown(markdown) {
  if (!markdown) return [''];
  const byHr = markdown.split(/\n---+\n/);
  if (byHr.length > 1) return byHr.filter((s) => s.trim());

  // Group paragraphs into ~500-word pages
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

export default function ReaderPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { getBook, updateProgress } = useBooks();

  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [contentType, setContentType] = useState('html');
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getBook(bookId);
        setBook(data);
        const type = data.contentType || 'html';
        setContentType(type);
        const pageList =
          type === 'markdown'
            ? splitMarkdown(data.content || '')
            : splitHtml(data.content || '');
        setPages(pageList);
        // Resume from last read page (API returns lastReadPage at top level)
        const lastPage = data.lastReadPage || 0;
        setCurrentPage(Math.min(lastPage, pageList.length - 1));
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load book');
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  const saveProgress = useCallback(
    (page) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => updateProgress(bookId, page), 1500);
    },
    [bookId, updateProgress]
  );

  const goToPage = (page) => {
    const clamped = Math.max(0, Math.min(page, pages.length - 1));
    setCurrentPage(clamped);
    saveProgress(clamped);
    window.scrollTo(0, 0);
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate('/library')}>
          Back to Library
        </Button>
      </div>
    );

  const progress =
    pages.length > 1 ? Math.round(((currentPage + 1) / pages.length) * 100) : 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate('/library')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{book?.title}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {currentPage + 1} / {pages.length}
          </span>
        </div>
        <div className="h-0.5 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {contentType === 'markdown' ? (
          <div className="prose prose-sm sm:prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {pages[currentPage] || ''}
            </ReactMarkdown>
          </div>
        ) : (
          <div
            className="prose prose-sm sm:prose max-w-none"
            dangerouslySetInnerHTML={{ __html: pages[currentPage] || '' }}
          />
        )}
      </main>

      {/* Navigation */}
      {pages.length > 1 && (
        <footer className="border-t sticky bottom-0 bg-background/95 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />Previous
            </Button>
            <span className="text-xs text-muted-foreground">{progress}% complete</span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === pages.length - 1}
              onClick={() => goToPage(currentPage + 1)}
              className="gap-1"
            >
              Next<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
