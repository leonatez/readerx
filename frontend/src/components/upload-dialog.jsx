import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function UploadDialog({ onUpload }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onUpload(url.trim(), title.trim() || 'Untitled');
      setUrl('');
      setTitle('');
      setOpen(false);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Upload failed';
      setError(msg === 'IMAGE_ONLY_PDF' ? 'This PDF is image-only (comic/manga). Text-based PDFs only.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Upload className="h-4 w-4" />Add Book</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Book from URL</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="book-url">URL <span className="text-muted-foreground text-xs">(PDF, DOCX, MOBI, Google Drive)</span></Label>
            <Input id="book-url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-title">Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="book-title" placeholder="My Book" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
