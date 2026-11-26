import { FlaskConical } from 'lucide-react';
import { EmptyState } from '../EmptyState';
import { BTN_SECONDARY, MUTED_CLS } from '../people/ui';
import { useStudyCaptures } from '../../hooks/api/useCaptures';
import { appLabel, formatCaptureDateTime } from '../../utils/captureInbox';
import { studyExpiresText } from '../../utils/captureInvestment';

/**
 * P21 L7: notifications kept "em estudo" (an XP text no reader understands yet). Read only: no confirm or dismiss. They
 * are deleted 60 days after they arrive; once a reader understands one, it moves to the inbox.
 */
const StudyCaptureList = ({ householdId }: { householdId: string | undefined }) => {
  const list = useStudyCaptures(householdId);
  const items = (list.data?.pages ?? []).flatMap((page) => page.data);

  if (!householdId || list.isPending) {
    return <p className={`text-sm font-light ${MUTED_CLS}`} role="status">Carregando...</p>;
  }
  if (list.isError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm font-light text-red-600 dark:text-red-400">Não foi possível carregar as notificações em estudo.</p>
        <button type="button" onClick={() => void list.refetch()} className={`${BTN_SECONDARY} min-h-[44px]`}>Tentar de novo</button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Nenhuma notificação em estudo"
        description="Textos da XP que o Prumo ainda não entende ficam aqui por 60 dias, fora da caixa."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className={`text-sm font-light ${MUTED_CLS}`}>
        Textos que o Prumo ainda não entende. Não viram lançamento nem movimento; servem para ensinar o leitor.
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{appLabel(item.package)}</p>
              <p className={`text-xs font-light ${MUTED_CLS}`}>{formatCaptureDateTime(item.postedAt)}</p>
            </div>
            {item.title && <p className="text-sm text-gray-900 dark:text-white break-words">{item.title}</p>}
            <p className="text-sm font-light whitespace-pre-line break-words text-gray-800 dark:text-gray-200">{item.text}</p>
            <p className={`text-xs font-light ${MUTED_CLS}`}>{studyExpiresText(item.expiresAt)}</p>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className={`${BTN_SECONDARY} min-h-[44px] w-full sm:w-auto`}
        >
          {list.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
};

export default StudyCaptureList;
