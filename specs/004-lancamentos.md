# Spec 004 — Lançamentos do dia

**Etapa:** 3 · **Agents:** frontend-ui, qa-tester · **Depende de:** 002, 003

## Objetivo
É a tela principal e a mais usada. Permite registrar, em poucos toques, quantas entregas de cada categoria foram feitas em um dia.

## Histórias
- Como usuário, abro o app e já estou na tela Lançar com a data de **hoje**.
- Como usuário, informo "50" em Sanduíche e "20" em Pizza e toco em **Salvar**. O app grava os dois lançamentos de uma vez.
- Como usuário, vejo o **subtotal ao vivo** (R$ 225,00) antes de salvar.
- Como usuário, troco a data para lançar um dia esquecido (ontem, ou outra data).
- Como usuário, vejo abaixo o que já lancei naquele dia e posso editar a quantidade ou excluir um lançamento.
- Como usuário, posso lançar a mesma categoria mais de uma vez no mesmo dia (ex.: turno da manhã e da noite). Cada envio vira um registro.

## Regras de negócio
- A data padrão é `hojeISO()`. Não é permitido lançar em data futura (o front bloqueia; o banco tem `check (data <= current_date + 1)` como margem de fuso, via migration `0002`).
- Só aparecem as categorias **ativas**.
- Quantidade é um inteiro de 1 a 9999. Categorias com quantidade 0 ou vazia são ignoradas no envio.
- O botão Salvar fica desabilitado se todas as quantidades forem 0.
- O envio é **um único insert em lote** (array). Se falhar, nada é gravado e o formulário mantém os valores.
- `valor_unitario` **não** é enviado pelo front; o trigger copia o preço da categoria (snapshot).
- Depois de salvar: zera os steppers, mostra o toast "Lançamentos salvos — R$ 225,00" e atualiza a lista do dia.
- A edição de um lançamento existente permite alterar **só a quantidade** (e a observação). O preço congelado se mantém.
- Excluir exige confirmação.
- Subtotal ao vivo: calculado em centavos inteiros (`quantidade * toCentavos(valor)`).

## Dados / API (`src/features/lancamentos/api.ts`)
| Função | Supabase |
|---|---|
| `listLancamentosDoDia(data)` | `from('lancamentos').select('*, categoria:categorias(nome)').eq('data', data).order('created_at')` |
| `createLancamentos(data, itens[])` | `insert(itens.map(i => ({ data, categoria_id, quantidade })))` |
| `updateLancamento(id, { quantidade, observacao })` | `update` |
| `deleteLancamento(id)` | `delete` |

Invalidar após a mutation: `['lancamentos', data]` e `['resumo']`.

## Wireframe
```
┌──────────────────────────────┐
│ Lançar                       │
│ ◀  Hoje, 20/11/2026  ▶  📅   │  ← ▶ desabilitado em hoje
├──────────────────────────────┤
│ Sanduíche · R$ 2,50          │
│        [ − ]  [ 50 ]  [ + ]  │
│ Pizza · R$ 5,00              │
│        [ − ]  [ 20 ]  [ + ]  │
│                              │
│ ── Já lançado hoje ───────── │
│ Sanduíche  30 × 2,50  R$75,00│ ⋮
│ Total do dia        R$ 75,00 │
├──────────────────────────────┤
│ Subtotal: R$ 225,00          │
│ [        Salvar            ] │  ← fixo acima da BottomNav
├──────────────────────────────┤
│  BottomNav                   │
└──────────────────────────────┘
```
- O stepper aceita digitação direta (`inputMode="numeric"`); manter o + pressionado incrementa continuamente (opcional).
- Sem categorias ativas: EmptyState "Cadastre suas categorias para começar" → link para `/categorias`.

## Critérios de aceite
- [ ] Lançar 50 Sanduíche (2,50) + 20 Pizza (5,00) mostra o subtotal R$ 225,00 e grava 2 registros com `valor_total` 125,00 e 100,00.
- [ ] Após reajustar Pizza para 6,00, os registros antigos continuam com 5,00, e um novo lançamento usa 6,00.
- [ ] Não é possível escolher uma data futura.
- [ ] Trocar a data recarrega a lista "Já lançado" daquela data.
- [ ] Editar a quantidade 20 → 25 atualiza o total do dia; excluir pede confirmação.
- [ ] Com a rede desligada, Salvar mostra um toast de erro e mantém os valores digitados.
- [ ] O fluxo inteiro cabe em 360×740 sem o teclado cobrir o botão Salvar.
