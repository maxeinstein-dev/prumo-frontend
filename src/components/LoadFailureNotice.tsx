import { LOAD_FAILURE_MESSAGE, LOAD_FAILURE_RETRY } from '../utils/loadFailure';

interface LoadFailureNoticeProps {
  onRetry: () => void;
  /** Overrides the default message ("Não foi possível carregar os dados."). */
  message?: string;
  className?: string;
}

/**
 * Shown in place of an empty state when a list failed to load and there is nothing to show: a failure is not "no
 * transactions". Same pattern as the new screens (message with role="alert" and a "Tentar de novo" button).
 */
export const LoadFailureNotice = ({ onRetry, message = LOAD_FAILURE_MESSAGE, className = '' }: LoadFailureNoticeProps) => (
  <div role="alert" className={`space-y-2 py-6 text-center ${className}`}>
    <p className="text-sm text-rc-red">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-[44px] rounded-xl border border-rc-line px-4 text-sm font-medium text-rc-ink"
    >
      {LOAD_FAILURE_RETRY}
    </button>
  </div>
);

export default LoadFailureNotice;
