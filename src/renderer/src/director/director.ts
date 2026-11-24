import type { LyricLine } from '@shared/lyrics';
import type { InterpretationPlan, SectionPlan } from '@shared/interpretation';
import type { SceneTransitionId } from '@/engine/transitions';
import { hash01 } from '@/animation/easing';
import type { VisualizationMeta } from '@/visualizations/types';

/**
 * The adaptive director: decides which visualisation (and variation) shows each part of a song,
 * and how one hands over to the next. Pure — the same song, catalogue and options always give
 * the same plan, so seeking straight to any moment shows the scene it would have reached.
 *
 * Rules (from the Phase 0 plan):
 * - Scenes change per *section*, never per line, and only on section boundaries.
 * - A scene stays at least one full section or `minDwellMs`, and a challenger must clearly win
 *   (`switchMargin`) — near-ties never flip.
 * - A section that returns (chorus 2, 3…) goes back to the scene it had, one step further along
 *   that scene's escalation (Thread → Lock Screen → Drift), so the song feels authored.
 * - Transitions are chosen from the pair: same scene → push; quiet after a break → fade;
 *   a jump in energy → push; between categories → sink; otherwise pan.
 * - Overrides: lock scene, lock variation, skip a scene for a section, style preferences;
 *   "manual" mode (in the store) bypasses the director entirely.
 */

export const DIRECTOR = {
  minDwellMs: 20_000,
  /** A section shorter than this can't trigger a switch on its own (unless it's a return). */
  minSectionMs: 8_000,
  /** How much better a new scene must score to replace the current one. */
  switchMargin: 0.15,
  /** A bridge is the song's own change of scenery: contrast is welcome there. */
  bridgeMarginFactor: 0.4,
  /** Scenes change this long before a section's first line, so the line lands in the new scene. */
  leadMs: 1200,
} as const;

export interface SceneCue {
  /** Song time at which this scene takes over. */
  atMs: number;
  endMs: number;
  sceneId: string;
  variation: string;
  transition: SceneTransitionId;
  /** Section indices this cue covers. */
  sections: number[];
  /** Short human explanation, shown in the lyrics panel. */
  reason: string;
}

export interface ScenePlan {
  trackKey: string;
  cues: SceneCue[];
}

export interface DirectorOptions {
  lockScene?: string | null;
  lockVariation?: string | null;
  /** −1 … +1 per scene id: the user's taste. */
  preferences?: Readonly<Record<string, number>>;
  /** Section index → scene ids the user skipped there. */
  excluded?: Readonly<Record<number, readonly string[]>>;
  seed?: number;
}

/* ───────────── Scoring ───────────── */

export function scoreScene(
  meta: VisualizationMeta,
  s: SectionPlan,
  opts: DirectorOptions = {},
): number {
  // Theme fit: the section's themes this scene declares, earlier-listed themes counting more.
  const total = s.themes.slice(0, 4).reduce((a, t) => a + t.weight, 0) || 1;
  let fit = 0;
  for (const t of s.themes) {
    const at = meta.themes.indexOf(t.id);
    if (at >= 0) fit += t.weight * (1 - 0.06 * at);
  }
  let score = Math.min(1.2, fit / total);
  if (meta.baseline) score = Math.max(score, 0.3);

  if (meta.moods?.includes(s.mood.label)) score += 0.12;
  if (meta.energy) {
    const [lo, hi] = meta.energy;
    const off = s.energy < lo ? lo - s.energy : s.energy > hi ? s.energy - hi : 0;
    score += 0.12 - off * 0.8;
  }
  score += (opts.preferences?.[meta.id] ?? 0) * 0.3;
  // Deterministic, tiny tie-breaker.
  score += hash01(s.index * 31 + meta.id.length, opts.seed ?? 0) * 0.01;
  return score;
}

const escalationOf = (m: VisualizationMeta) => m.escalation ?? m.variations.map((v) => v.id);

function pickTransition(
  from: SceneCue,
  to: { sceneId: string },
  fromMeta: VisualizationMeta | undefined,
  toMeta: VisualizationMeta | undefined,
  prevSection: SectionPlan | undefined,
  next: SectionPlan,
  fromEnergy: number,
): SceneTransitionId {
  if (from.sceneId === to.sceneId) return 'push';
  if (prevSection && prevSection.lines[0] === prevSection.lines[1] && next.energy < 0.35)
    return 'fade';
  if (next.energy - fromEnergy >= 0.2) return 'push';
  if (fromMeta && toMeta && fromMeta.category !== toMeta.category) return 'sink';
  return 'pan';
}

const label = (s: SectionPlan) =>
  s.kind.charAt(0).toUpperCase() + s.kind.slice(1) + (s.occurrence ? ` ${s.occurrence + 1}` : '');

/* ───────────── Planning ───────────── */

export function directSong(
  interp: InterpretationPlan,
  lines: readonly LyricLine[],
  catalog: readonly VisualizationMeta[],
  opts: DirectorOptions = {},
): ScenePlan {
  const sections = interp.sections;
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const cues: SceneCue[] = [];
  const groupHome = new Map<number, { sceneId: string; step: number }>();
  const sung = (s: SectionPlan) => s.lines[0] !== s.lines[1];

  const candidatesFor = (s: SectionPlan) => {
    let list = catalog;
    if (opts.lockScene && byId.has(opts.lockScene)) list = [byId.get(opts.lockScene)!];
    const skipped = opts.excluded?.[s.index] ?? [];
    const allowed = list.filter((m) => !skipped.includes(m.id));
    return allowed.length ? allowed : list;
  };

  const variationFor = (meta: VisualizationMeta, step: number): string => {
    if (opts.lockVariation && meta.variations.some((v) => v.id === opts.lockVariation)) {
      return opts.lockVariation;
    }
    const esc = escalationOf(meta);
    return esc[Math.min(step, esc.length - 1)] ?? meta.variations[0]!.id;
  };

  for (const s of sections) {
    const cur = cues.at(-1);
    // Sections without lyrics never cause a switch: the current scene plays through.
    if (!sung(s)) {
      if (cur) {
        cur.sections.push(s.index);
        cur.endMs = s.endMs;
      }
      continue;
    }

    const options = candidatesFor(s);
    let pick: { meta: VisualizationMeta; step: number; why: string };
    const home = s.group !== null ? groupHome.get(s.group) : undefined;
    const homeMeta = home ? options.find((m) => m.id === home.sceneId) : undefined;
    if (home && homeMeta) {
      pick = { meta: homeMeta, step: home.step + s.occurrence, why: 'returns, one step further' };
    } else {
      const scored = options
        .map((meta) => {
          let sc = scoreScene(meta, s, opts);
          if (cur && cur.sceneId === meta.id) {
            sc += DIRECTOR.switchMargin * (s.kind === 'bridge' ? DIRECTOR.bridgeMarginFactor : 1);
          }
          return { meta, sc };
        })
        .sort((a, b) => b.sc - a.sc);
      const best = scored[0]!.meta;
      const step = cur && cur.sceneId === best.id ? escalationOf(best).indexOf(cur.variation) : 0;
      const themes = s.themes
        .filter((t) => best.themes.includes(t.id))
        .slice(0, 2)
        .map((t) => t.id);
      pick = {
        meta: best,
        step: Math.max(0, step),
        why: themes.length ? themes.join(', ') : best.baseline ? 'calm baseline' : 'best fit',
      };
    }
    if (s.group !== null && !groupHome.has(s.group)) {
      groupHome.set(s.group, { sceneId: pick.meta.id, step: pick.step });
    }
    const variation = variationFor(pick.meta, pick.step);

    if (cur && cur.sceneId === pick.meta.id && cur.variation === variation) {
      cur.sections.push(s.index);
      cur.endMs = s.endMs;
      continue;
    }

    // Dwell: the current scene must have had its moment, and a short section can't take over
    // unless it's a return (a chorus coming back is exactly when a change should happen).
    if (cur) {
      const curFullSections = cur.sections.filter((i) => {
        const x = sections[i]!;
        return sung(x) && x.endMs - x.startMs >= DIRECTOR.minSectionMs;
      }).length;
      const dwelt = s.startMs - cur.atMs >= DIRECTOR.minDwellMs || curFullSections >= 1;
      const strongEnough = s.endMs - s.startMs >= DIRECTOR.minSectionMs || s.group !== null;
      if (!dwelt || !strongEnough) {
        cur.sections.push(s.index);
        cur.endMs = s.endMs;
        continue;
      }
    }

    const firstLine = lines[s.lines[0]];
    const prevLineEnd = lines[s.lines[0] - 1]?.endMs ?? 0;
    const lineStart = firstLine?.startMs ?? s.startMs;
    const atMs = cur
      ? Math.min(lineStart, Math.max(prevLineEnd + 250, lineStart - DIRECTOR.leadMs))
      : 0;
    const prevSection = sections[s.index - 1];
    const fromEnergy = cur
      ? Math.max(
          ...cur.sections
            .map((i) => sections[i]!)
            .filter(sung)
            .map((x) => x.energy),
          0,
        )
      : 0;
    const transition: SceneTransitionId = cur
      ? pickTransition(
          cur,
          { sceneId: pick.meta.id },
          byId.get(cur.sceneId),
          pick.meta,
          prevSection,
          s,
          fromEnergy,
        )
      : 'sink';
    if (cur) cur.endMs = atMs;
    cues.push({
      atMs,
      endMs: s.endMs,
      sceneId: pick.meta.id,
      variation,
      transition,
      sections: [s.index],
      reason: `${label(s)} · ${pick.why}`,
    });
  }

  // Sections before the first sung one (the intro) belong to the opening scene.
  const first = cues[0];
  if (first) {
    const lead = sections.filter(
      (x) => x.endMs <= first.atMs || (!sung(x) && x.index < first.sections[0]!),
    );
    first.sections = [...lead.map((x) => x.index), ...first.sections]
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b);
    first.atMs = 0;
    cues.at(-1)!.endMs = interp.durationMs;
  }
  return { trackKey: interp.trackKey, cues };
}

/** Index of the cue active at time t (-1 if the plan is empty). */
export function cueIndexAt(plan: ScenePlan, t: number): number {
  let lo = 0;
  let hi = plan.cues.length - 1;
  let found = plan.cues.length ? 0 : -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plan.cues[mid]!.atMs <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Index of the section playing at time t (-1 if none). */
export function sectionIndexAt(interp: InterpretationPlan, t: number): number {
  const s = interp.sections;
  for (let i = s.length - 1; i >= 0; i--) if (s[i]!.startMs <= t) return i;
  return s.length ? 0 : -1;
}
