import { Skeleton } from '@/components/ui';

/** Esqueleto do card de total e das listas. */
export function RelatorioSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Carregando relatório…</span>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
