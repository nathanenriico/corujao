-- ============================================================
-- MIGRAÇÃO: RECLASSIFICAR COPÕES NAS CATEGORIAS CERTAS
-- ------------------------------------------------------------
-- Separa os 45 produtos da categoria genérica "Copões" em:
--   • Copões de Gin e Vodka
--   • Copões de Whisky
--   • Copões Gourmet
--   • Copões (mantém os que não se encaixam nas outras)
--
-- SEGURO: só UPDATE em produtos com categoria='Copões'.
-- Execute no Supabase → SQL Editor → Run.
-- ============================================================

-- ── 1. GIN e VODKA ──────────────────────────────────────────
-- Produtos cujo nome contém marcas de gin ou vodka
UPDATE public.produtos
SET categoria = 'Copões de Gin e Vodka'
WHERE categoria = 'Copões'
  AND (
    nome ILIKE '%tanqueray%'
    OR nome ILIKE '%beefeater%'
    OR nome ILIKE '%bombay%'
    OR nome ILIKE '%absolut%'
    OR nome ILIKE '%rocks%'     -- Gin Rocks
    OR nome ILIKE '%eternit%'   -- Eternit Gin
    OR nome ILIKE '%goose%'     -- Grey Goose vodka
    OR nome ILIKE '%askov%'     -- vodka nacional
    OR nome ILIKE '%bob pinga%'
  );

-- ── 2. WHISKY ───────────────────────────────────────────────
UPDATE public.produtos
SET categoria = 'Copões de Whisky'
WHERE categoria = 'Copões'
  AND (
    nome ILIKE '%jack%'         -- Jack Daniels (todas variações)
    OR nome ILIKE '%jim beam%'
    OR nome ILIKE '%jum beam%'  -- typo cadastro
    OR nome ILIKE '%chivas%'
    OR nome ILIKE '%black label%'
    OR nome ILIKE '%red label%'
    OR nome ILIKE '%white horse%'
    OR nome ILIKE '%old par%'
    OR nome ILIKE '%ballant%'   -- Ballantines, Balantines, Balantine's
    OR nome ILIKE '%buchanan%'
    OR nome ILIKE '%passport%'
    OR nome ILIKE '%licor 43%'
    OR nome ILIKE '%chanceler%'
    OR nome ILIKE '%busca brisa%'
  );

-- ── 3. GOURMET ──────────────────────────────────────────────
UPDATE public.produtos
SET categoria = 'Copões Gourmet'
WHERE categoria = 'Copões'
  AND (
    nome ILIKE '%ballena%'      -- Ballena (chocolate, tradicional, etc.)
    OR nome ILIKE '%gourmet%'
  );

-- ── 4. Garante que as novas categorias existem na tabela ────
INSERT INTO public.categorias (nome, emoji, ordem)
VALUES
  ('Copões de Gin e Vodka', '🍸', 2),
  ('Copões de Whisky',      '🥃', 3),
  ('Copões Gourmet',        '🍽️', 4)
ON CONFLICT (nome) DO NOTHING;

-- ── 5. Ajusta a ordem da categoria genérica "Copões" ────────
-- (fica depois das subcategorias para não aparecer misturada)
UPDATE public.categorias
SET ordem = 5
WHERE nome = 'Copões';

-- ── 6. Confirma o resultado ──────────────────────────────────
-- (opcional — rode após executar para verificar)
SELECT categoria, COUNT(*) as total
FROM public.produtos
WHERE categoria IN ('Copões','Copões de Gin e Vodka','Copões de Whisky','Copões Gourmet')
GROUP BY categoria
ORDER BY categoria;
