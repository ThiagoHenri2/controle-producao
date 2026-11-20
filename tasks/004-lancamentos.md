# Tasks — 004 Lançamentos do dia
Spec: [specs/004-lancamentos.md](../specs/004-lancamentos.md)

- [x] **T004.1** — Migration `0002_lancamentos_data_check.sql`: `check (data <= current_date + 1)`. — agent: db-supabase — depende de: T002.2 — aceite: insert com data futura (+2 dias) falha.
- [x] **T004.2** — `src/features/lancamentos/api.ts` + `hooks.ts` (list do dia com join do nome da categoria, insert em lote, update, delete; invalidar `['lancamentos', data]` e `['resumo']`). — agent: frontend-ui — depende de: T003.1 — aceite: hooks tipados.
- [x] **T004.3** — Seletor de data (◀ / ▶ / calendário nativo), padrão hoje, sem datas futuras. — agent: frontend-ui — depende de: T001.5 — aceite: ▶ desabilitado em hoje.
- [x] **T004.4** — Formulário de lançamento: um Stepper por categoria ativa, subtotal ao vivo em centavos e botão Salvar fixo. — agent: frontend-ui — depende de: T004.2, T004.3 — aceite: 50×2,50 + 20×5,00 mostra R$ 225,00.
- [x] **T004.5** — Envio em lote, toast com o total, reset dos steppers; em caso de erro, mantém os valores. — agent: frontend-ui — depende de: T004.4 — aceite: critérios de salvar e de falha de rede.
- [x] **T004.6** — Lista "Já lançado" do dia com total, editar quantidade (sheet) e excluir (confirm). — agent: frontend-ui — depende de: T004.2 — aceite: editar 20→25 atualiza o total.
- [x] **T004.7** — Ajustes mobile: teclado não cobre o Salvar, `inputMode`, EmptyState sem categorias. — agent: frontend-ui — depende de: T004.5, T004.6 — aceite: teste manual em 360×740.
- [x] **T004.8** — Testes: subtotal em centavos, payload do insert (sem `valor_unitario`, ignora qtd 0), botão desabilitado com tudo zero, erro mantém valores. — agent: qa-tester — depende de: T004.7 — aceite: `npm test` verde.
- [x] **T004.9** — Ampliar o `rls_check.sql`: preço congelado após reajuste e lançamento em categoria alheia falhando. — agent: qa-tester — depende de: T004.1 — aceite: o script passa.
