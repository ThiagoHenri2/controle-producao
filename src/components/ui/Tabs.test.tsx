import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TabPanel, Tabs } from './Tabs';

type Aba = 'a' | 'b' | 'c';
const ITENS = [
  { value: 'a', label: 'Entregas' },
  { value: 'b', label: 'Despesas' },
  { value: 'c', label: 'Outros' },
] as const;

function Controlado() {
  const [aba, setAba] = useState<Aba>('a');
  return (
    <>
      <Tabs label="Tipo" idBase="t" items={ITENS} value={aba} onChange={setAba} />
      <TabPanel idBase="t" value={aba}>
        conteúdo {aba}
      </TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('liga aba e painel (aria-selected, aria-controls, aria-labelledby) com alvo ≥ 44px', () => {
    render(<Controlado />);
    const tab = screen.getByRole('tab', { name: 'Entregas' });
    expect(screen.getByRole('tablist', { name: 'Tipo' })).toBeInTheDocument();
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAttribute('aria-controls', 't-panel-a');
    expect(tab.className).toContain('min-h-touch');
    expect(screen.getByRole('tabpanel', { name: 'Entregas' })).toHaveTextContent('conteúdo a');
  });

  it('clique e setas/Home/End trocam a aba e movem o foco (roving tabindex)', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.click(screen.getByRole('tab', { name: 'Despesas' }));
    expect(screen.getByRole('tabpanel', { name: 'Despesas' })).toHaveTextContent('conteúdo b');
    expect(screen.getByRole('tab', { name: 'Entregas' })).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Outros' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Entregas' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Outros' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Entregas' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Outros' })).toHaveFocus();
  });
});
