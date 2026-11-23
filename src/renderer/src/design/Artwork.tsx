import type { TrackRef } from '@shared/lyrics';
import './artwork.css';

/**
 * Album artwork. Real artwork (Spotify) is shown exactly as delivered — square, unfiltered.
 * Demo tracks have no artwork file, so they get an original generated cover.
 */
export interface ArtPalette {
  /** Dominant/accent colours used to tint surrounding UI (never the art itself). */
  tint1: string;
  tint2: string;
}

const demoCovers: Record<string, { palette: ArtPalette; variant: 'signal' | 'dusk' }> = {
  'demo:delivered': { palette: { tint1: '#e9c27f', tint2: '#7187bd' }, variant: 'signal' },
  'demo:long-way-round': { palette: { tint1: '#f0a46a', tint2: '#c7667a' }, variant: 'dusk' },
};

const fallbackPalette: ArtPalette = { tint1: '#e8c27a', tint2: '#6f86b8' };

export function paletteFor(track: TrackRef | null): ArtPalette {
  return (track && demoCovers[track.key]?.palette) || fallbackPalette;
}

export function Artwork({ track, size }: { track: TrackRef | null; size: number }) {
  const style = { width: size, height: size };
  if (track?.artworkUrl) {
    return (
      <img className="artwork" src={track.artworkUrl} alt="" style={style} draggable={false} />
    );
  }
  const cover = track ? demoCovers[track.key] : undefined;
  return (
    <div className={`artwork artwork--${cover?.variant ?? 'blank'}`} style={style} aria-hidden>
      <span className="artwork__mark" />
    </div>
  );
}
