import { useCallback, useEffect, useState } from 'react';
import { hojeISO } from '@/lib/format';

type Estado = { data: string; manual: boolean };

/**
 * Data selecionada na tela Lançar. Sempre começa em hoje (não é persistida).
 * Se o usuário não escolheu outra data e o app volta ao primeiro plano num novo
 * dia (PWA aberto de ontem para hoje), a data acompanha o novo "hoje".
 */
export function useDataLancamento() {
  const [estado, setEstado] = useState<Estado>(() => ({ data: hojeISO(), manual: false }));

  useEffect(() => {
    const sincronizar = () => {
      if (document.visibilityState !== 'visible') return;
      const hoje = hojeISO();
      setEstado((e) => (!e.manual && e.data !== hoje ? { data: hoje, manual: false } : e));
    };
    document.addEventListener('visibilitychange', sincronizar);
    window.addEventListener('focus', sincronizar);
    return () => {
      document.removeEventListener('visibilitychange', sincronizar);
      window.removeEventListener('focus', sincronizar);
    };
  }, []);

  const setData = useCallback((data: string) => {
    const hoje = hojeISO();
    const segura = data > hoje ? hoje : data;
    setEstado({ data: segura, manual: segura !== hoje });
  }, []);

  return [estado.data, setData] as const;
}
