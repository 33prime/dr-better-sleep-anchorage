import { type ReactNode } from 'react';
import { StatusBar } from './StatusBar';

interface Props {
  theme?: 'day' | 'night';
  children: ReactNode;
}

/** Mounts once. Each route renders inside via the AnimatedStage. */
export function DeviceFrame({ theme = 'day', children }: Props) {
  return (
    <div className="device" data-theme={theme}>
      <div className={`screen ${theme}`}>
        <StatusBar />
        {children}
      </div>
    </div>
  );
}
