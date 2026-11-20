import { TabPanel, Tabs } from '@/components/ui';
import { ABAS, useAba } from '@/features/despesas/aba';
import { UsuarioAlvoSelect } from '@/features/equipe/components/UsuarioAlvoSelect';
import { useUsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { CategoriasLista } from './components/CategoriasLista';

const ID_ABAS = 'categorias-aba';

/**
 * Categorias (spec 003) com as abas Entregas | Despesas (`?aba=`, spec 009).
 * O gestor gerencia as de qualquer atendente (spec 008).
 */
export function CategoriasPage() {
  const alvo = useUsuarioAlvo();
  const [aba, setAba] = useAba();

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Tipo de categoria" idBase={ID_ABAS} items={ABAS} value={aba} onChange={setAba} />
      <UsuarioAlvoSelect alvo={alvo} acao="vendo" rotulo="Categorias de" />
      <TabPanel idBase={ID_ABAS} value={aba}>
        <CategoriasLista key={aba} tipo={aba} alvo={alvo} />
      </TabPanel>
    </div>
  );
}
