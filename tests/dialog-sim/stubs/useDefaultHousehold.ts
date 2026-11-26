export function useDefaultHousehold() {
  const g = globalThis as any;
  return { householdId: g.__defaultHousehold ?? undefined, household: g.__household ?? undefined, isLoading: false };
}
