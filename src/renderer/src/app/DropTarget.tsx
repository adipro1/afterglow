import { useEffect, useState } from 'react';
import { importDropped } from '@/lyrics/importer';
import { report } from './LyricsPanel';

/**
 * Drop audio or lyrics anywhere on the window. Electron would otherwise navigate to a dropped
 * file, so every drop is caught here.
 */
export function DropTarget() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void importDropped(files).then((rs) => rs.forEach(report));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overFn);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={`drop ${over ? 'is-over' : ''}`} aria-hidden={!over}>
      <div className="drop__card">
        <div className="drop__title">Drop to play or add lyrics</div>
        <div className="drop__sub">
          Audio files play here · .lrc, .srt or .txt attach to the song
        </div>
      </div>
    </div>
  );
}
