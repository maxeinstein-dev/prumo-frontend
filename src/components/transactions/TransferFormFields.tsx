import { useEffect, useRef } from 'react';
import { Controller, Control, UseFormWatch, UseFormSetValue, FieldErrors } from 'react-hook-form';
import { useI18n } from '../../context/I18nContext';
import { AccountType, CategoryType, TransactionType } from '../../lib/enums';
import { TransactionFormData } from '../../schemas';
import { useCategories } from '../../hooks/api/useCategories';
import { investmentsCategoryValue, isInvestmentContribution } from '../../utils/investmentContribution';
import CategoryCombobox from '../CategoryCombobox';
import SelectCombobox from '../SelectCombobox';
import type { Account } from '../../types';

interface TransferFormFieldsProps {
  control: Control<TransactionFormData>;
  watch: UseFormWatch<TransactionFormData>;
  setValue: UseFormSetValue<TransactionFormData>;
  errors: FieldErrors<TransactionFormData>;
  accounts: Account[];
  disabled?: boolean;
  /** For the household's own categories (the aporte's "Investimentos"). */
  householdId?: string;
}

export const TransferFormFields = ({ 
  control, 
  watch, 
  setValue, 
  errors, 
  accounts, 
  disabled,
  householdId,
}: TransferFormFieldsProps) => {
  const { t } = useI18n();

  const fromAccountId = watch('fromAccountId');
  const toAccountId = watch('toAccountId');
  const category = watch('category');
  const availableDestAccounts = accounts.filter(
    a => a.type !== AccountType.CREDIT && a.id !== fromAccountId
  );

  // An aporte (into an investment account, from one that is not) counts as invested (P24): it gets a category, and
  // "Investimentos" is filled in when the household has it. Any other transfer carries none.
  const isAporte = isInvestmentContribution(
    accounts.find(a => a.id === fromAccountId),
    accounts.find(a => a.id === toAccountId),
  );
  const { data: expenseCategories } = useCategories({ householdId, type: CategoryType.EXPENSE });
  const suggested = investmentsCategoryValue(expenseCategories);
  // The picker has no empty choice, so an empty category in an aporte only comes from the form itself (opening, the
  // type switch clearing it, the categories still loading): fill it in whenever that happens. Leaving the aporte
  // (another destination) takes the category off.
  const wasAporte = useRef(false);
  useEffect(() => {
    if (isAporte && !category && suggested) {
      setValue('category', suggested, { shouldValidate: false });
    }
    if (!isAporte && wasAporte.current && category) {
      setValue('category', '', { shouldValidate: false });
    }
    wasAporte.current = isAporte;
  }, [isAporte, suggested, category, setValue]);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t.fromAccount}
        </label>
        <Controller
          name="fromAccountId"
          control={control}
          render={({ field }) => (
            <SelectCombobox
              value={field.value || ''}
              onValueChange={(value) => {
                field.onChange(value);
                const toAccountId = watch('toAccountId');
                if (toAccountId === value) {
                  setValue('toAccountId', '', { shouldValidate: true });
                }
              }}
              options={[
                { value: '', label: t.selectAccount },
                ...accounts.filter(a => a.type !== AccountType.CREDIT).map(account => ({
                  value: account.id || '',
                  label: account.name
                }))
              ]}
              placeholder={t.selectAccount}
              disabled={disabled}
            />
          )}
        />
        {errors.fromAccountId && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.fromAccountId.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t.toAccount}
        </label>
        <Controller
          name="toAccountId"
          control={control}
          render={({ field }) => (
            <SelectCombobox
              value={field.value || ''}
              onValueChange={(value) => {
                field.onChange(value);
                const currentFromAccountId = watch('fromAccountId');
                if (currentFromAccountId === value) {
                  setValue('fromAccountId', '', { shouldValidate: true });
                }
              }}
              options={[
                { value: '', label: t.selectAccount },
                ...availableDestAccounts.map(account => ({
                  value: account.id || '',
                  label: account.name
                }))
              ]}
              placeholder={t.selectAccount}
              disabled={disabled}
            />
          )}
        />
        {errors.toAccountId && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.toAccountId.message}</p>
        )}
      </div>

      {isAporte && (
        <div data-testid="transfer-aporte-category">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t.category}
          </label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <CategoryCombobox
                value={field.value || ''}
                onValueChange={(value: string) => field.onChange(value)}
                placeholder={t.category}
                type={TransactionType.EXPENSE}
                disabled={disabled}
                householdId={householdId}
                allowCreate
              />
            )}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Aporte: conta como investido no orçamento desta categoria, no Geral e na divisão da renda. Sem categoria,
            conta só no Geral.
          </p>
        </div>
      )}
    </>
  );
};
