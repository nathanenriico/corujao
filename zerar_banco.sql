-- ============================================================
-- ZERAR DADOS DO BANCO — Adega Corujão
-- Execute no SQL Editor do Supabase.
-- ATENÇÃO: apaga TODAS as vendas, itens, gastos e movimentações.
-- Os produtos e suas configurações são PRESERVADOS.
-- ============================================================

BEGIN;

-- 1. Fiados (referencia vendas)
DELETE FROM public.fiados;

-- 2. Itens de venda
DELETE FROM public.itens_venda;

-- 3. Movimentações de estoque
DELETE FROM public.movimentacoes_estoque;

-- 4. Gastos / entradas de mercadoria
DELETE FROM public.gastos;

-- 5. Vendas
DELETE FROM public.vendas;

-- 6. Clientes (histórico de compras)
DELETE FROM public.clientes;

COMMIT;

-- ============================================================
-- RESULTADO ESPERADO
-- ============================================================
-- Tabelas zeradas: fiados, itens_venda, movimentacoes_estoque,
--                  gastos, vendas, clientes
-- Tabelas preservadas: produtos (com estoque e configurações)
-- ============================================================
