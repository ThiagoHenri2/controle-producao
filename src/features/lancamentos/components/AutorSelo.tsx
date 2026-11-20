/** Selo "por <nome>" quando quem lançou não é o dono (spec 008; despesas, spec 009). */
export function AutorSelo({ autor }: { autor: string }) {
  return (
    <span
      data-testid="selo-autor"
      className="max-w-[55%] shrink-0 truncate rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800"
    >
      por {autor}
    </span>
  );
}
