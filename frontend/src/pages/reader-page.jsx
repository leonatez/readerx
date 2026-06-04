import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBooks } from '@/hooks/use-books';
import { Button } from '@/components/ui/button';
import { ReaderSettings } from '@/components/reader-settings';
import { splitHtml, splitMarkdown } from '@/lib/content-splitter';

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
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(() =>
    parseInt(localStorage.getItem('readerx-font-size') || '16', 10)
  );
  const [lineHeight, setLineHeight] = useState(() =>
    parseFloat(localStorage.getItem('readerx-line-height') || '1.8')
  );
  const saveTimer = useRef(null);
  const touchOrigin = useRef(null);

  useEffect(() => { localStorage.setItem('readerx-font-size', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('readerx-line-height', lineHeight); }, [lineHeight]);

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

  // Record where the finger landed so we can distinguish tap from scroll/drag
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    if (t) touchOrigin.current = { x: t.clientX, y: t.clientY };
  };

  // Navigate only when the finger barely moved (tap, not a scroll drag)
  const handleTap = (e) => {
    if (pages.length <= 1 || !touchOrigin.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchOrigin.current.x);
    const dy = Math.abs(touch.clientY - touchOrigin.current.y);
    touchOrigin.current = null;
    if (dx > 10 || dy > 10) return; // finger dragged — let the scroll happen naturally
    goToPage(touch.clientX < window.innerWidth / 2 ? currentPage - 1 : currentPage + 1);
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
        <Button variant="outline" onClick={() => navigate('/library')}>Back to Library</Button>
      </div>
    );

  const progress =
    pages.length > 1 ? Math.round(((currentPage + 1) / pages.length) * 100) : 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/library')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{book?.title}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {currentPage + 1} / {pages.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Reading settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
        {showSettings && (
          <ReaderSettings
            fontSize={fontSize}
            lineHeight={lineHeight}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
          />
        )}
        <div className="h-0.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* Content — onTouchEnd drives tap-to-navigate on mobile */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8" onTouchStart={handleTouchStart} onTouchEnd={handleTap}>
        {contentType === 'markdown' ? (
          <div
            className="prose prose-sm sm:prose max-w-none"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{pages[currentPage] || ''}</ReactMarkdown>
          </div>
        ) : (
          <div
            className="prose prose-sm sm:prose max-w-none"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
            dangerouslySetInnerHTML={{ __html: pages[currentPage] || '' }}
          />
        )}
      </main>

      {/* Navigation */}
      {pages.length > 1 && (
        <footer className="border-t sticky bottom-0 bg-background/95 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <Button
              variant="outline" size="sm" disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - 1)} className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />Previous
            </Button>
            <span className="text-xs text-muted-foreground">{progress}% complete</span>
            <Button
              variant="outline" size="sm" disabled={currentPage === pages.length - 1}
              onClick={() => goToPage(currentPage + 1)} className="gap-1"
            >
              Next<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
