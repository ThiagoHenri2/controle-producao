# Spec 003 — Categorias de lançamento

**Etapa:** 2 · **Agents:** frontend-ui, qa-tester · **Depende de:** 001, 002

## Objetivo
Permitir que cada usuário cadastre os **tipos de entrega** e o valor unitário de cada um (ex.: "Sanduíche — R$ 2,50", "Pizza — R$ 5,00").

## Histórias
- Como usuário, cadastro uma categoria com nome e valor.
- Como usuário, edito o nome e o valor (reajuste). Os lançamentos antigos mantêm o valor da época.
- Como usuário, desativo uma categoria que não uso mais; ela some da tela Lançar, mas continua no relatório histórico.
- Como usuário, reativo uma categoria desativada.
- Como usuário, excluo uma categoria **somente** se ela nunca teve lançamentos.

## Regras de negócio
- Nome obrigatório, de 1 a 60 caracteres, único por usuário (sem diferenciar maiúsculas; o front normaliza com `trim`).
- Valor ≥ 0,00, com no máximo 2 casas. O input aceita "2,50" e "2.50".
- Excluir uma categoria com lançamentos → o banco bloqueia (FK `restrict`). O front mostra "Esta categoria já tem lançamentos. Desative-a em vez de excluir." e oferece o botão "Desativar".
- Ordenação: ativas primeiro, depois por nome.
- Ao editar o valor, mostre o aviso: "O novo valor vale para os próximos lançamentos."

## Dados / API (`src/features/categorias/api.ts`)
| Função | Supabase |
|---|---|
| `listCategorias({ incluirInativas })` | `from('categorias').select('*').order('ativa',{ascending:false}).order('nome')` |
| `createCategoria({ nome, valor_unitario })` | `insert` (user_id via default) |
| `updateCategoria(id, patch)` | `update` |
| `deleteCategoria(id)` | `delete` → tratar o erro `23503` (FK) |

Erro `23505` (unique) → "Já existe uma categoria com esse nome."

## Wireframe
```
┌──────────────────────────────┐
│ Categorias                   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Pizza            R$ 5,00 │ │
│ │                 [editar] │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Sanduíche        R$ 2,50 │ │
│ └──────────────────────────┘ │
│ ── Inativas (1) ▾ ────────── │
│                              │
│ [  ＋ Nova categoria        ] │  ← botão fixo acima da BottomNav
├──────────────────────────────┤
│  BottomNav                   │
└──────────────────────────────┘

Bottom sheet "Nova / Editar categoria":
 Nome  [ Sanduíche          ]
 Valor [ R$ 2,50            ]  (inputMode=decimal)
 [Ativa ☑]
 [Excluir]          [Salvar]
```

## Critérios de aceite
- [x] Criar "Sanduíche 2,50" e "Pizza 5,00"; ambas aparecem na lista formatadas em BRL.
- [x] Nome duplicado mostra a mensagem amigável, sem erro técnico.
- [x] Valor "-1" ou "abc" é bloqueado no formulário.
- [ ] Editar o valor não altera os lançamentos anteriores (verificado pelo relatório). _Pendente: depende das specs 004/005; no banco é garantido pelo snapshot de preço (`lancamentos_preco_snapshot`, spec 002)._
- [ ] Uma categoria inativa não aparece em Lançar, mas aparece no relatório de períodos em que teve lançamentos. _Pendente: depende das specs 004/005; a tela Lançar deve usar `useCategorias({ incluirInativas: false })`._
- [x] Excluir uma categoria sem lançamentos funciona; com lançamentos, oferece desativar.
- [x] O estado vazio mostra "Cadastre sua primeira categoria" com um botão.

## Notas de implementação
- **Unicidade sem diferenciar maiúsculas:** o banco só tem `unique(user_id, nome)`, que diferencia maiúsculas. O front checa contra a lista carregada (ativas e inativas) com `trim` + `toLocaleLowerCase('pt-BR')` e espaços internos colapsados (`nomeDuplicado` em `schema.ts`); o erro `23505` continua tratado como rede de segurança. Duas abas/aparelhos ainda podem criar "Pizza" e "pizza" ao mesmo tempo; se isso importar, o `db-supabase` pode trocar a constraint por um índice único em `(user_id, lower(trim(nome)))`.
- **Aviso de reajuste:** aparece no sheet de edição assim que o valor digitado difere do valor atual.
- **Excluir categoria inativa com lançamentos:** como ela já está desativada, não há o que oferecer; o front mostra só um toast ("…não pode ser excluída. Ela continua desativada.").
- **Valor:** aceita "2,50", "2.50", "2,5", "2" e "R$ 2,50"; rejeita negativo, letras, separador de milhar ("1.234,50") e mais de 2 casas. A conversão é feita em centavos inteiros (sem float).
