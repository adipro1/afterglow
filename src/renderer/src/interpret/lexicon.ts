import type { ThemeId } from '@shared/interpretation';

/**
 * The curated vocabulary the local interpreter reads lyrics with. Small on purpose: every
 * entry is a judgement about imagery (what a scene could *show*), not a dictionary.
 *
 * - `concepts`: single words → themes, plus feeling (valence −1…1, arousal 0…1).
 * - `phrases`: patterns that change what words mean in context ("call it off" is not a phone
 *   call; "drowning in you" is not about water). A phrase can silence the words it covers.
 * - Negation ("not alone", "don't love") flips feeling and weakens the theme — see features.ts.
 */

export type ThemeWeights = Partial<Record<ThemeId, number>>;

export interface Concept {
  words: readonly string[];
  themes?: ThemeWeights;
  valence?: number;
  arousal?: number;
  /** Negation weakens/flips it ("not alone"). Imagery words (rain, phone) don't negate. */
  negatable?: boolean;
}

export interface Phrase {
  /** Matched against normalised text: lowercase, no punctuation, apostrophes removed. */
  re: RegExp;
  themes?: ThemeWeights;
  valence?: number;
  arousal?: number;
  /** Words inside the match that should not also count on their own. */
  silences?: readonly string[];
}

const c = (
  words: string,
  themes: ThemeWeights,
  feel: { v?: number; a?: number; neg?: boolean } = {},
): Concept => ({
  words: words.split(' '),
  themes,
  valence: feel.v,
  arousal: feel.a,
  negatable: feel.neg,
});

const feel = (words: string, v: number, a: number, neg = true): Concept => ({
  words: words.split(' '),
  valence: v,
  arousal: a,
  negatable: neg,
});

export const concepts: readonly Concept[] = [
  // Messages & technology
  c('text texts texted texting message messages typed typing reply replied', {
    messages: 1,
    conversation: 0.5,
  }),
  c('phone phones screen notification notifications inbox unread delivered emoji', {
    messages: 1,
    technology: 0.5,
  }),
  c('signal signals wifi static battery offline online network', { technology: 1, messages: 0.3 }),
  c('cursor scrolled scroll scrolling dm dms ringing ringtone voicemail', {
    messages: 0.8,
    technology: 0.6,
  }),
  c('photo photos picture pictures polaroid', { memory: 0.8, messages: 0.3 }),
  // Conversation
  c('said say says saying told tell telling talk talking ask asked answer answered words', {
    conversation: 1,
  }),
  c('hello hey', { conversation: 0.8 }, { a: 0.3 }),
  // Longing, separation, heartbreak, love
  c(
    'miss missing wish wishing waiting wait waited longing',
    { longing: 1 },
    { v: -0.4, a: 0.3, neg: true },
  ),
  c(
    'gone leave leaving left away apart distance goodbye far',
    { separation: 1 },
    { v: -0.5, a: 0.35 },
  ),
  c(
    'broken break breaking heartbreak shattered hurt hurts tears crying cried cry',
    { heartbreak: 1 },
    { v: -0.8, a: 0.55, neg: true },
  ),
  c(
    'love loved loving lover darling baby heart kiss kissed hold holding',
    { love: 1 },
    { v: 0.7, a: 0.45, neg: true },
  ),
  c('forever always together', { love: 0.6, time: 0.4 }, { v: 0.5, a: 0.3, neg: true }),
  // Memory & time
  c(
    'remember remembered memory memories yesterday ago summer nostalgia',
    { memory: 1 },
    { v: 0.05, a: 0.25 },
  ),
  c(
    'clock hours minutes seconds time tonight morning late early waiting',
    { time: 1 },
    { a: 0.35 },
  ),
  // Night, city, sky
  c('night nights midnight dark darkness moon moonlight blue', { night: 1 }, { v: -0.1, a: 0.25 }),
  c('stars star sky skies heaven space satellite galaxy orbit', { sky: 1 }, { v: 0.3, a: 0.3 }),
  c(
    'city cities street streets neon traffic subway downtown avenue skyline lights',
    { city: 1 },
    { a: 0.55 },
  ),
  // Travel & home
  c(
    'road roads highway drive driving drove car cars train trains station miles map',
    { travel: 1 },
    { a: 0.55 },
  ),
  c(
    'flight flights plane gate boarding airport land landed runway passport',
    { travel: 1, sky: 0.3 },
    { a: 0.5 },
  ),
  c('home house room bed window door kitchen hometown', { home: 1 }, { v: 0.2, a: 0.2 }),
  // Elements & nature
  c(
    'rain raining ocean sea waves river tide drown drowning flood water swim',
    { water: 1 },
    { v: -0.1, a: 0.4 },
  ),
  c('fire burn burning flame flames spark sparks ash ashes smoke', { fire: 1 }, { v: 0, a: 0.8 }),
  c(
    'trees forest flowers flower garden field fields mountain mountains snow wind',
    { nature: 1 },
    { v: 0.3, a: 0.3 },
  ),
  // Dreams, freedom, party
  c('dream dreams dreaming asleep sleep sleeping wake awake', { dreams: 1 }, { v: 0.1, a: 0.2 }),
  c(
    'free freedom run running escape wild fly flying',
    { freedom: 1 },
    { v: 0.5, a: 0.75, neg: true },
  ),
  c(
    'dance dancing party club floor tonight music loud',
    { party: 1 },
    { v: 0.7, a: 0.9, neg: true },
  ),
  // Isolation, reflection, hope
  c(
    'alone lonely loneliness empty nobody silence silent quiet',
    { isolation: 1 },
    { v: -0.6, a: 0.2, neg: true },
  ),
  c('maybe wonder wondering think thinking mirror myself why', { reflection: 1 }, { v: 0, a: 0.2 }),
  c('hope hoping someday light open chance begin', { hope: 1 }, { v: 0.55, a: 0.35, neg: true }),
  // Feelings without a strong picture
  feel('happy smile smiling laugh laughing alive golden bright sunshine', 0.8, 0.6),
  feel('sad sorry regret lost lose losing cold numb tired', -0.7, 0.3),
  feel('scream screaming shout fight fighting rage angry', -0.6, 0.95),
  feel('afraid scared fear panic', -0.6, 0.8),
  feel('calm slow softly gentle still', 0.2, 0.1),
];

export const phrases: readonly Phrase[] = [
  // The phone call that is a conversation vs. the one that ends something.
  {
    re: /\bcall (it|this) (off|quits)\b/g,
    themes: { separation: 1.2 },
    valence: -0.6,
    silences: ['call'],
  },
  {
    re: /\bcall (me|you|him|her|back|home)\b/g,
    themes: { conversation: 1, messages: 0.6 },
    silences: ['call'],
  },
  {
    re: /\b(never|not|left on|been|was) read\b/g,
    themes: { messages: 1.2, longing: 0.4 },
    valence: -0.4,
  },
  { re: /\bthree dots\b/g, themes: { messages: 1.4 }, arousal: 0.4 },
  { re: /\bvoice notes?\b/g, themes: { messages: 1, memory: 0.4 } },
  { re: /\bblue light\b/g, themes: { night: 0.8, technology: 0.6 }, silences: ['blue', 'light'] },
  {
    re: /\b(when|before|after|till|until) (you|i|we|they) (land|landed)\b/g,
    themes: { travel: 0.6, longing: 0.4 },
    silences: ['land', 'landed'],
  },
  // Time of night ("two fourteen", "3 am").
  {
    re: /\b(one|two|three|four|1|2|3|4) (am|oclock)\b|\b(two|three|four) (fourteen|thirty|fifteen|forty)\b/g,
    themes: { night: 1, time: 0.6 },
  },
  // Metaphors: the feeling, not the literal picture.
  {
    re: /\bdrown(ing|ed)? in\b/g,
    themes: { heartbreak: 0.6, water: 0.4 },
    valence: -0.5,
    silences: ['drown', 'drowning', 'drowned'],
  },
  { re: /\bon fire\b/g, themes: { party: 0.6, fire: 0.6 }, arousal: 0.9, silences: ['fire'] },
  { re: /\bheart (of|made of) (glass|stone|gold)\b/g, themes: { heartbreak: 0.6 } },
  { re: /\bused to\b/g, themes: { memory: 1 }, valence: -0.15 },
  { re: /\bback (then|when)\b/g, themes: { memory: 1 } },
  { re: /\b(the )?long way (round|around|home)\b/g, themes: { travel: 1, longing: 0.6 } },
  {
    re: /\b(leave|left) the (window|door|light|lights) (open|on)\b/g,
    themes: { hope: 1, longing: 0.6, home: 0.4 },
    valence: 0.2,
  },
  { re: /\bin case\b/g, themes: { hope: 0.5 } },
  // Directions are travel, not leaving.
  {
    re: /\b(turn|turned|go|keep|take|took) (left|right)\b/g,
    themes: { travel: 0.8 },
    silences: ['left'],
  },
  { re: /\bfalling (for|in love)\b/g, themes: { love: 1 }, valence: 0.6 },
  { re: /\bfall(ing)? apart\b/g, themes: { heartbreak: 1 }, valence: -0.7, silences: ['apart'] },
];

/** Words that negate what follows within two words. */
export const negators: ReadonlySet<string> = new Set(
  'not never no dont cant wont aint didnt isnt wasnt arent couldnt wouldnt shouldnt without nothing'.split(
    ' ',
  ),
);

/** Words too common to be a section's focus. */
export const stopwords: ReadonlySet<string> = new Set(
  (
    'a an the and but or so of to in on at by for from with as is am are was were be been being ' +
    'i im ive id ill me my mine you youre youve youd youll your yours we us our they them their ' +
    'he him his she her it its this that these those there here what when where who how why ' +
    'just still then than too very all any some only if do does did dont cant wont not no yes ' +
    'oh ooh yeah la na hey uh up down out over again into like got get gonna wanna one'
  ).split(' '),
);

/** Fast lookup: word → concept. Built once. */
export const conceptByWord: ReadonlyMap<string, Concept> = (() => {
  const m = new Map<string, Concept>();
  for (const k of concepts) for (const w of k.words) if (!m.has(w)) m.set(w, k);
  return m;
})();
