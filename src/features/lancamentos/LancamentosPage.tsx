import { useState } from 'react';
import { TabPanel, Tabs } from '@/components/ui';
import { ABAS, useAba } from '@/features/despesas/aba';
import { DespesasTab } from '@/features/despesas/components/DespesasTab';
import { UsuarioAlvoSelect } from '@/features/equipe/components/UsuarioAlvoSelect';
import { useUsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { hojeISO } from '@/lib/format';
import { DateSelector } from './components/DateSelector';
import { EntregasTab } from './components/EntregasTab';
import { useDataLancamento } from './useDataLancamento';

const ID_ABAS = 'lancar-aba';

/**
 * Tela Lançar com as abas Entregas | Despesas (`?aba=`, spec 009). A data
 * (spec 004) e o entregador alvo (`?usuario=`, spec 008) valem para as duas
 * abas e são mantidos ao trocar de aba.
 */
export function LancamentosPage() {
  const [aba, setAba] = useAba();
  const [data, setData] = useDataLancamento();
  const [saving, setSaving] = useState(false);
  const hoje = hojeISO();
  const alvo = useUsuarioAlvo();
  const props = { alvo, data, hoje, onSavingChange: setSaving };

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Tipo de lançamento"
        idBase={ID_ABAS}
        items={ABAS}
        value={aba}
        onChange={(next) => {
          // Um envio interrompido pela troca de aba não pode deixar a data travada.
          setSaving(false);
          setAba(next);
        }}
      />
      <UsuarioAlvoSelect alvo={alvo} acao="lançando" />
      <DateSelector value={data} hoje={hoje} onChange={setData} disabled={saving} />
      <TabPanel idBase={ID_ABAS} value={aba}>
        {aba === 'despesas' ? <DespesasTab {...props} /> : <EntregasTab {...props} />}
      </TabPanel>
    </div>
  );
}
