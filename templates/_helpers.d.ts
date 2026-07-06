// Hand-written declarations for the design-system TS pages that import this
// plain-JS module (design-system/ssg/pages/*). Deliberately partial: only the
// exports the TS side actually consumes are declared — extend it when a page
// pulls in another helper.
export function formatScrobbleCount(n: unknown): string;
