import type { Person } from '../../hooks/api/usePeople';
import { quickSplitLabel, type QuickSplit } from '../../utils/defaultSplit';

interface QuickSplitPillsProps {
  value: QuickSplit;
  onChange: (choice: QuickSplit) => void;
  /** The person the pills name (last used, else the first active one); null hides the pills. */
  person: Person | null;
  /** Active people: with more than one, a select changes who the pills name. */
  people: Person[];
  onPersonChange: (person: Person) => void;
  /** Style of a pill (each surface has its own look). */
  pillClass: (selected: boolean) => string;
  labelClass: string;
  selectClass: string;
  disabled?: boolean;
}

const CHOICES: QuickSplit[] = ['mine', 'half', 'theirs'];

/**
 * P19 "dividir" em um toque: "Só meu", "Metade com <pessoa>", "É de <pessoa>". The amounts are computed by the server.
 * Shown only for an expense and when the household has an active person.
 */
export const QuickSplitPills = ({ value, onChange, person, people, onPersonChange, pillClass, labelClass, selectClass, disabled = false }: QuickSplitPillsProps) => {
  if (!person) return null;
  const active = people.filter((p) => p.isActive);
  return (
    <div data-testid="quick-split">
      <div className={labelClass} id="quick-split-label">Dividir</div>
      <div role="group" aria-labelledby="quick-split-label" className="flex flex-wrap gap-2 py-1">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={value === choice}
            disabled={disabled}
            onClick={() => onChange(choice)}
            className={pillClass(value === choice)}
          >
            {quickSplitLabel(choice, person)}
          </button>
        ))}
      </div>
      {active.length > 1 && value !== 'mine' && (
        <div className="mt-1">
          <label htmlFor="quick-split-person" className="sr-only">Pessoa</label>
          <select
            id="quick-split-person"
            value={person.id}
            disabled={disabled}
            onChange={(e) => {
              const next = active.find((p) => p.id === e.target.value);
              if (next) onPersonChange(next);
            }}
            className={selectClass}
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
