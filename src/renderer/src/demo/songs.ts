import { buildDemoSong, type DemoSong } from './build';

/*
 * Original lyrics written for AFTERGLOW's demo mode and test suite.
 * They are deliberately themed so each one exercises different visualisations.
 */

export const delivered: DemoSong = buildDemoSong(
  {
    key: 'demo:delivered',
    title: 'Delivered',
    artists: ['Afterglow Demo Session'],
    album: 'Night Mode',
    durationSec: 150,
  },
  [
    // Verse 1
    [6.0, 3.6, 'Your name lit up at two fourteen'],
    [10.2, 3.8, 'Just a photo of the place we used to meet'],
    [14.6, 3.2, 'I typed hello and held it there'],
    [18.4, 3.6, 'Watched the cursor blinking in the air'],
    // Pre-chorus
    [23.0, 2.6, 'Three dots, then nothing'],
    [26.2, 3.2, 'Three dots, then nothing again'],
    // Chorus
    [31.0, 3.4, 'Delivered, but never read'],
    [35.0, 3.4, 'Every word I should have said'],
    [39.0, 3.8, 'Sitting in the blue light by my bed'],
    [43.4, 3.6, 'Delivered, but never read'],
    // Verse 2
    [52.0, 3.8, 'Scrolled back to the summer of our start'],
    [56.4, 3.8, 'Voice notes from the backseat of your car'],
    [60.8, 3.0, 'You said call me when you land', 'feat'],
    [64.4, 3.8, "I still have it, I still don't understand"],
    // Chorus 2
    [70.0, 3.4, 'Delivered, but never read'],
    [74.0, 3.4, 'Every word I should have said'],
    [78.0, 3.8, 'Sitting in the blue light by my bed'],
    [82.4, 3.6, 'Delivered, but never read'],
    // Bridge (after an instrumental gap)
    [96.0, 3.0, "Maybe you're asleep somewhere"],
    [100.0, 3.0, "Maybe you're already there"],
    [104.0, 3.6, "I'll leave the window open"],
    [108.4, 3.2, 'Just in case the signal comes'],
    // Final chorus
    [114.0, 3.4, 'Delivered, but never read'],
    [118.0, 3.4, 'Every word I should have said'],
    [122.0, 3.8, 'Sitting in the blue light by my bed'],
    [126.4, 3.6, 'Delivered, but never read'],
    // Outro
    [134.0, 2.4, 'Delivered'],
    [137.6, 2.4, 'Delivered'],
    [141.6, 3.4, 'Never read'],
  ],
);

export const longWayRound: DemoSong = buildDemoSong(
  {
    key: 'demo:long-way-round',
    title: 'Long Way Round',
    artists: ['Afterglow Demo Session'],
    album: 'Night Mode',
    durationSec: 72,
  },
  [
    [4.0, 3.4, 'Gate eleven, nineteen hundred hours'],
    [8.0, 3.4, 'Boarding pass and borrowed flowers'],
    [12.0, 3.6, "Every city's just a different light"],
    [16.2, 3.6, "I'm taking the long way round tonight"],
    [24.0, 3.0, 'Turn left at the river'],
    [27.6, 3.0, 'Keep going till the map runs out'],
    [31.2, 3.8, "There's a road I haven't learned about"],
    [40.0, 3.6, "I'm taking the long way round"],
    [44.2, 3.6, 'The long way round to you'],
    [52.0, 3.6, "I'm taking the long way round"],
    [56.2, 4.4, 'The long way round to you'],
  ],
);

export const demoSongs: readonly DemoSong[] = [delivered, longWayRound];
