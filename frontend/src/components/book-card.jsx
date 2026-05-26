import { Trash2, BookOpen, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const FILE_TYPE_COLORS = { pdf: 'default', docx: 'secondary', mobi: 'outline' };

export default function BookCard({ book, onDelete }) {
  const navigate = useNavigate();
  const progress = book.metadata?.pageCount
    ? Math.round(((book.metadata.lastReadPage || 0) / book.metadata.pageCount) * 100)
    : 0;

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">{book.title}</CardTitle>
          <Badge variant={FILE_TYPE_COLORS[book.fileType] || 'outline'} className="shrink-0 uppercase">
            {book.fileType}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {book.metadata?.pageCount ? `${book.metadata.pageCount} pages` : 'Unknown length'}
          {book.metadata?.imageCount > 0 && ` · ${book.metadata.imageCount} images`}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-2 flex-1">
        {progress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 gap-2">
        <Button size="sm" className="flex-1 gap-1" onClick={() => navigate(`/read/${book._id}`)}>
          <BookOpen className="h-3.5 w-3.5" />
          {progress > 0 ? 'Continue' : 'Read'}
        </Button>
        <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(book._id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
