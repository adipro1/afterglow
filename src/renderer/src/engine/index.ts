/**
 * AFTERGLOW motion engine — the one import a scene needs.
 *
 *   time        ticker (one frame loop), ambient (non-musical time), timeline (cues → 0..1)
 *   physics     spring / springs / appleSpring, easing curves
 *   output      style writers: transform(), setTransform, setOpacity, setData, setText, …
 *   layout      flowStack (items that make room for each other), useMeasure (sizes, no reflow)
 *   text        Words (word spans), applyWordStates, isSung, applyTyping
 *   camera      breathe / shake / nudge / move → Pose → poseTransform; Rig component
 *   transitions revealClip (shape reveals), sceneTransitions (scene hand-offs)
 *   field       makeField / motePose (seeded particles)
 *
 * Rules every scene follows (see CLAUDE.md): visual state is a pure function of
 * (lyrics, song time, variation, seed); per-frame work goes through `useTicker` and the style
 * writers; only transform and opacity change per frame.
 */
export { ticker, useTicker, type FrameInfo } from './ticker';
export { ambient } from './ambient';
export * from './timeline';
export * from './style';
export * from './stack';
export * from './measure';
export * from './text';
export * from './camera';
export * from './transitions';
export * from './field';
export { Rig } from './Rig';
export * from '@/animation/easing';
export * from '@/animation/spring';
