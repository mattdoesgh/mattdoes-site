import { ThoughtRow, type ThoughtRowProps } from './ThoughtRow';

export interface NotebookThought extends ThoughtRowProps {
  id: string;
}

export interface NotebookDayProps {
  /** Intake's CT source-day key (`YYYY-MM-DD`). */
  date: string;
  thoughts: NotebookThought[];
}

function dayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(parsed).toLowerCase();
}

/** A daily notebook page: one authored day containing its Thought fragments. */
export function NotebookDay({ date, thoughts }: NotebookDayProps) {
  return (
    <section className="notebook-day" aria-labelledby={`day-${date}`}>
      <header className="notebook-day__head">
        <h2 id={`day-${date}`}><time {...{ datetime: date }}>{dayLabel(date)}</time></h2>
        <span>{thoughts.length} {thoughts.length === 1 ? 'note' : 'notes'}</span>
      </header>
      <div className="notebook-day__entries">
        {thoughts.map(thought => <ThoughtRow key={thought.id} {...thought} />)}
      </div>
    </section>
  );
}
