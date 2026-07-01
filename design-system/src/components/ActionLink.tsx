import type { ReactNode } from 'react';
import { relValue, safeUrl } from '../lib/format';

export interface ActionLinkProps {
  href: string;
  children: ReactNode;
  tone?: 'primary' | 'secondary';
  className?: string;
}

/** A prominent text action used for editorial CTAs without introducing buttons. */
export function ActionLink({ href, children, tone = 'secondary', className = '' }: ActionLinkProps) {
  const classes = ['action-link', `action-link--${tone}`, className].filter(Boolean).join(' ');
  return (
    <a className={classes} href={safeUrl(href)} rel={relValue(href)}>
      {children}
    </a>
  );
}
