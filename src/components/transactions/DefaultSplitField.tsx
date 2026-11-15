import { useI18n } from '../../context/I18nContext';
import type { Person } from '../../hooks/api/usePeople';
import { defaultSplitSummary, type DefaultShare, type DefaultSplitDraft } from '../../utils/defaultSplit';

interface DefaultSplitFieldProps {
  value: DefaultSplitDraft;
  onChange: (draft: DefaultSplitDraft) => void;
  /** People of the household (active ones are offered; an inactive one already chosen stays visible). */
  people: Person[];
  /** The split stored on the recurrence, to show one the form cannot edit. */
  stored?: DefaultShare[] | null;
  showError?: boolean;
  disabled?: boolean;
}

const LABEL = 'block text-sm font-light text-gray-500 dark:text-gray-400 mb-2';
const INPUT =
  'block w-full min-h-[44px] rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-light text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500';

/**
 * P19 "Dividir com": the person and the percent of each occurrence that is theirs. The occurrence is born with that
 * share (the server computes it on the real amount); empty percent = the whole bill is theirs.
 */
export const DefaultSplitField = ({ value, onChange, people, stored, showError = false, disabled = false }: DefaultSplitFieldProps) => {
  const { t } = useI18n();
  const tr = t as unknown as Record<string, string | undefined>;

  if (!value.editable) {
    return (
      <div data-testid="default-split-field">
        <span className={LABEL}>{tr.defaultSplitLabel || 'Dividir com'}</span>
        <p className="text-sm font-light text-gray-900 dark:text-white">{defaultSplitSummary(stored) ?? '—'}</p>
        <p className="mt-1 text-xs font-light text-gray-500 dark:text-gray-400">
          {tr.defaultSplitKept || 'Divisão com mais de uma pessoa ou valor fixo: fica como está.'}
        </p>
      </div>
    );
  }

  const options = people.filter((p) => p.isActive || p.id === value.personId);
  const percentInvalid = showError && value.personId !== '' && value.percent.trim() !== '' && !/^\d{1,3}([.,]\d{1,2})?$/.test(value.percent.trim());

  return (
    <div data-testid="default-split-field">
      <span className={LABEL}>{tr.defaultSplitLabel || 'Dividir com'}</span>
      {options.length === 0 ? (
        <p className="text-xs font-light text-gray-500 dark:text-gray-400">
          {tr.defaultSplitNoPeople || 'Cadastre uma pessoa em Pessoas para dividir esta conta.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="default-split-person" className="sr-only">{tr.defaultSplitPerson || 'Pessoa'}</label>
          <select
            id="default-split-person"
            value={value.personId}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, personId: e.target.value })}
            className={`${INPUT} sm:flex-1`}
          >
            <option value="">{tr.defaultSplitNobody || 'Ninguém (só meu)'}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {value.personId !== '' && (
            <div className="flex items-center gap-2 sm:w-36">
              <label htmlFor="default-split-percent" className="sr-only">{tr.defaultSplitPercent || 'Percentual'}</label>
              <input
                id="default-split-percent"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100"
                disabled={disabled}
                value={value.percent}
                aria-invalid={percentInvalid || undefined}
                onChange={(e) => onChange({ ...value, percent: e.target.value })}
                className={`${INPUT} text-right`}
              />
              <span className="text-sm font-light text-gray-500 dark:text-gray-400">%</span>
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-xs font-light text-gray-500 dark:text-gray-400">
        {tr.defaultSplitHelp || 'Cada ocorrência já nasce com a parte da pessoa, sobre o valor real do mês. Vazio = 100%.'}
      </p>
      {percentInvalid && (
        <p role="alert" className="mt-1 text-xs font-light text-red-600 dark:text-red-400">
          {tr.defaultSplitPercentInvalid || 'Percentual entre 0,01 e 100.'}
        </p>
      )}
    </div>
  );
};
