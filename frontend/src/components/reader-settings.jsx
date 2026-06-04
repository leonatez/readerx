import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 26, 28];
const LINE_HEIGHTS = [1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4];

/**
 * Inline settings panel rendered inside the sticky header.
 * Controls font size and line height for the reader content.
 */
export function ReaderSettings({ fontSize, lineHeight, onFontSizeChange, onLineHeightChange }) {
  const fontIdx = FONT_SIZES.indexOf(fontSize);
  // Snap to nearest entry if stored value doesn't exactly match any preset
  const lineIdx = (() => {
    const exact = LINE_HEIGHTS.findIndex((v) => Math.abs(v - lineHeight) < 0.05);
    if (exact >= 0) return exact;
    return LINE_HEIGHTS.reduce((ci, v, i) =>
      Math.abs(v - lineHeight) < Math.abs(LINE_HEIGHTS[ci] - lineHeight) ? i : ci, 0);
  })();

  return (
    <div className="max-w-3xl mx-auto px-4 pb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground w-24">Font Size</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={fontIdx <= 0}
            onClick={() => onFontSizeChange(FONT_SIZES[Math.max(0, fontIdx - 1)])}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-12 text-center text-sm font-medium">{fontSize}px</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={fontIdx >= FONT_SIZES.length - 1}
            onClick={() => onFontSizeChange(FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIdx + 1)])}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground w-24">Line Height</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={lineIdx <= 0}
            onClick={() => onLineHeightChange(LINE_HEIGHTS[Math.max(0, lineIdx - 1)])}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-12 text-center text-sm font-medium">{lineHeight.toFixed(1)}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={lineIdx >= LINE_HEIGHTS.length - 1}
            onClick={() => onLineHeightChange(LINE_HEIGHTS[Math.min(LINE_HEIGHTS.length - 1, lineIdx + 1)])}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
