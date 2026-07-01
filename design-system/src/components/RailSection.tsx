import type { ReactNode } from 'react';

export interface RailSectionProps {
  heading: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}

/** A quiet side-rail section with the established `.group` markup contract. */
export function RailSection({ heading, meta, children }: RailSectionProps) {
  return (
    <div className="group rail-section">
      <h2>
        {heading}
        {meta ? <span className="m">{meta}</span> : null}
      </h2>
      {children}
    </div>
  );
}
