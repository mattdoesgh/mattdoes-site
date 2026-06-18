import { Time } from '@mattdoes/ds';

const instant = '2026-06-12T09:30:00.000Z';

export const Day = () => <Time date={instant} />;

export const Month = () => <Time date={instant} format="month" />;

export const Iso = () => <Time date={instant} format="iso" />;

export const TimeOfDay = () => <Time date={instant} format="time" />;
