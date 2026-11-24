import { useDirector } from '@/director/store';

/**
 * The song's shape along the progress bar: a faint mark where each section begins, and the
 * choruses lit a little brighter. Static between songs — nothing here changes per frame.
 */
export function SongMap({ durationMs }: { durationMs: number }) {
  const interp = useDirector((s) => s.interpretation);
  if (!interp || !durationMs) return null;
  return (
    <div className="song-strip" aria-hidden data-testid="song-map">
      {interp.sections.map((s) => (
        <span
          key={s.index}
          className="song-strip__seg"
          data-kind={s.kind}
          style={{
            left: `${(s.startMs / durationMs) * 100}%`,
            width: `${(Math.max(0, Math.min(s.endMs, durationMs) - s.startMs) / durationMs) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
