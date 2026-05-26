import { useEffect } from 'react';
import { LogOut, BookOpen, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useBooks } from '@/hooks/use-books';
import BookCard from '@/components/book-card';
import UploadDialog from '@/components/upload-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LibraryPage() {
  const { signOut, session } = useAuth();
  const { books, loading, error, fetchBooks, uploadBook, deleteBook } = useBooks();

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const handleUpload = async (url, title) => {
    await uploadBook(url, title);
    await fetchBooks();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <span className="font-semibold">Boox Reader</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">{session?.user?.email}</span>
            <UploadDialog onUpload={handleUpload} />
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">My Library</h2>
            <p className="text-sm text-muted-foreground">{books.length} {books.length === 1 ? 'book' : 'books'}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchBooks} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && books.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 rounded-xl border bg-muted animate-pulse" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">No books yet</p>
            <p className="text-sm mt-1">Add a PDF, DOCX, or MOBI from a URL to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <BookCard key={book._id} book={book} onDelete={deleteBook} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
