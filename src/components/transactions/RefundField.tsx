import { useI18n } from '../../context/I18nContext';

interface RefundFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** "É estorno": an income that cancels an expense (not income: the month's spending goes down instead). */
export const RefundField = ({ checked, onChange, disabled = false }: RefundFieldProps) => {
  const { t } = useI18n();
  return (
    <div data-testid="refund-field">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="refund-toggle"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className={`h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        />
        <label htmlFor="refund-toggle" className="ml-2 block text-sm text-gray-900 dark:text-gray-100 cursor-pointer">
          {t.refundToggle || 'É estorno'}
        </label>
      </div>
      <p className="mt-1 text-xs font-light text-gray-500 dark:text-gray-400">
        {t.refundHelp || 'Não conta como receita: abate a despesa da categoria no mês.'}
      </p>
    </div>
  );
};
