import type { ReactNode } from 'react';
import { Fragment } from 'react';

export interface TimelineGroupProps {
  label: ReactNode;
  count: ReactNode;
  children?: ReactNode;
}

/** Date/count divider plus the rows that follow it. */
export function TimelineGroup({ label, count, children }: TimelineGroupProps) {
  return (
    <Fragment>
      <div className="tl-divider">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      {children}
    </Fragment>
  );
}
