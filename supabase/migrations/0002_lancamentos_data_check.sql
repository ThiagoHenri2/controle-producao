-- =====================================================================
-- 0002_lancamentos_data_check.sql
-- Spec 004 — Lançamentos do dia (T004.1)
--
-- Não permite lançamento em data futura. A margem de +1 dia cobre a
-- diferença de fuso entre o cliente (America/Sao_Paulo) e o servidor
-- (UTC): o front bloqueia datas > hoje; o banco é a última barreira.
--
-- Idempotente: pode ser reaplicada sem erro.
-- Obs.: se já existir algum lançamento com data > current_date + 1,
-- o add constraint falha (23514) — corrija/apague esses registros antes.
-- =====================================================================

alter table public.lancamentos
  drop constraint if exists lancamentos_data_nao_futura;

alter table public.lancamentos
  add constraint lancamentos_data_nao_futura
  check (data <= current_date + 1);
