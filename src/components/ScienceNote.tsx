// A one-line, cited science aside that any screen can drop under its data —
// the "integrate the science freely" seam. Every note states a claim the
// evidence base actually supports (../RESEARCH.md), carries its source, and
// taps through to the full Science screen.

import { useLocation } from 'wouter';
import s from './ScienceNote.module.css';

const NOTES = {
  site: {
    text: 'Each snore type lives in its own frequency band — palatal low, tongue-base mid, nasal high. The mix is what guides the strap.',
    cite: 'Sci. Rep. srep30629',
  },
  timing: {
    text: 'The rhythm of snoring predicts severity better than the count — which is why quiet stretches matter more than one number.',
    cite: 'Meta-analysis · PMC9670768',
  },
  validated: {
    text: 'Counting snores from a nightstand mic is validated science — 95% accuracy against ground truth in formal trials.',
    cite: 'JMIR Formative Research 2025',
  },
  alcohol: {
    text: 'Alcohol relaxes the exact airway muscles the device is holding — the one variable the strap can’t fight.',
    cite: 'RESEARCH.md §1',
  },
} as const;

export type ScienceNoteKind = keyof typeof NOTES;

export function ScienceNote({ kind }: { kind: ScienceNoteKind }) {
  const [, navigate] = useLocation();
  const note = NOTES[kind];
  return (
    <button className={`${s.note} tap`} onClick={() => navigate('/trends/science')}>
      <span className={s.moon} aria-hidden>☾</span>
      <span className={s.body}>
        {note.text}
        <span className={s.cite}>{note.cite} · the science →</span>
      </span>
    </button>
  );
}
