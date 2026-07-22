// The three snore types, their vibration sites, and their acoustic bands —
// shared by the Science screen and the chat science card. Band edges match
// the live detector's classifier (useSnoreDetector) and the band→site
// mapping literature (../RESEARCH.md §1-2).

export interface SnoreType {
  key: 'palatal' | 'tongue' | 'nasal';
  name: string;
  site: string;
  loHz: number;
  hiHz: number;
  character: string;
  device: string;
  sample: string; // synthesized sample audio (always labeled "sample audio" in UI)
}

export const SNORE_TYPES: SnoreType[] = [
  {
    key: 'palatal',
    name: 'Palatal',
    site: 'Soft palate',
    loHz: 60, hiHz: 300,
    character: 'A periodic low rumble — the classic snore. The soft palate flutters as air squeezes past on each breath.',
    device: 'The type the mouthpiece treats best: advancing the jaw tightens the tissue that flutters.',
    sample: '/samples/snore-1.wav',
  },
  {
    key: 'tongue',
    name: 'Tongue base',
    site: 'Back of the tongue',
    loHz: 300, hiHz: 1000,
    character: 'Broadband and irregular — a wetter, rougher sound. The tongue falls back and narrows the airway.',
    device: 'Also squarely in the mouthpiece’s reach — jaw advancement pulls the tongue base forward with it.',
    sample: '/samples/snore-2.wav',
  },
  {
    key: 'nasal',
    name: 'Nasal',
    site: 'Nasal passages',
    loHz: 1000, hiHz: 3000,
    character: 'A high, whistling flutter. Air forced through a congested or narrow nose.',
    device: 'The one the mouthpiece can’t fix — breathing strips or a saline rinse are the right tools here.',
    sample: '/samples/snore-3.wav',
  },
];

export const BAND_MAX_HZ = 3000;
