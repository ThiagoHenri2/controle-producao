import { cn } from '@/lib/cn';

type SkeletonProps = { className?: string };

/** Bloco cinza pulsante para estados de carregamento. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-slate-200', className)} />;
}

type SkeletonListProps = { rows?: number; label?: string };

/** Lista de skeletons com texto acessível "Carregando…". */
export function SkeletonList({ rows = 3, label = 'Carregando…' }: SkeletonListProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
