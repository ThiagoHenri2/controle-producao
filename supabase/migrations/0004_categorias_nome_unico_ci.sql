-- =====================================================================
-- 0004_categorias_nome_unico_ci.sql
-- Spec 003 — Categorias: nome único por usuário sem diferenciar
-- maiúsculas/minúsculas nem espaços nas pontas ("Pizza" = " pizza ").
--
-- Troca a constraint unique (user_id, nome) criada na 0001 (nome gerado
-- pelo Postgres: categorias_user_id_nome_key) por um índice único de
-- expressão (user_id, lower(btrim(nome))).
-- A violação continua sendo SQLSTATE 23505 (unique_violation).
--
-- Idempotente. Obs.: se já houver duplicatas case-insensitive para o
-- mesmo usuário, o create unique index falha — renomeie-as antes.
-- =====================================================================

alter table public.categorias
  drop constraint if exists categorias_user_id_nome_key;

-- Segurança extra: remove qualquer outra unique constraint exatamente em
-- (user_id, nome), caso o nome gerado tenha sido diferente.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.categorias'::regclass
       and con.contype = 'u'
       and (select array_agg(att.attname::text order by att.attname)
              from unnest(con.conkey) k
              join pg_attribute att
                on att.attrelid = con.conrelid and att.attnum = k)
           = array['nome', 'user_id']
  loop
    execute format('alter table public.categorias drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists categorias_user_id_nome_ci_key
  on public.categorias (user_id, lower(btrim(nome)));
