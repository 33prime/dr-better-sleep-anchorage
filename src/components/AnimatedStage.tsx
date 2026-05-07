import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { type ReactNode, useRef } from 'react';

interface Props { children: ReactNode }

/**
 * Wraps the active page in a motion.div that slides in/out based on the
 * direction of navigation (forward = in from right, back = in from left).
 *
 * We track the location's "depth" (number of segments) to decide direction.
 * `/` = 0, `/chat` = 1, `/night/2026-05-06` = 2, etc.
 */
export function AnimatedStage({ children }: Props) {
  const [location] = useLocation();
  const prevLocation = useRef(location);

  const depth = (loc: string) => loc.split('/').filter(Boolean).length;
  const dir = depth(location) >= depth(prevLocation.current) ? 1 : -1;
  prevLocation.current = location;

  return (
    <div className="stage">
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        <motion.div
          key={location}
          className="page"
          custom={dir}
          variants={{
            initial:  (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
            animate:  { x: 0, opacity: 1 },
            exit:     (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
          }}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
