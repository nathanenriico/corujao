-- ============================================================
-- MIGRAÇÃO: CARDÁPIO PÚBLICO — Adega Corujão
-- ------------------------------------------------------------
-- Adiciona o que o site público precisa, SEM mexer nos dados
-- existentes: campos de visibilidade/descrição/tamanho nos
-- produtos, uma VIEW segura (esconde custo), tabelas para tamanhos
-- de copo, sabores de copão e configurações da loja.
--
-- Seguro executar mais de uma vez (IF NOT EXISTS / OR REPLACE).
-- Preserve o banco, produtos, estoque, vendas e histórico atuais.
--
-- Como executar:
--   Supabase → SQL Editor → New query → cole este arquivo → Run.
-- ============================================================

-- ============================================================
-- 1. CAMPOS PÚBLICOS NA TABELA produtos
-- ============================================================

-- visivel_publico: se TRUE, o produto aparece no cardápio do site.
-- Como nem todo item do estoque é vendido separadamente, vem
-- desligado por padrão — a administração liga no painel.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS visivel_publico BOOLEAN NOT NULL DEFAULT FALSE;

-- descricao_publica: texto curto exibido no cardápio (opcional).
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao_publica TEXT;

-- tamanho: rótulo do tamanho exibido no cardápio (ex.: "600ml", "2L").
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tamanho TEXT;

-- ============================================================
-- 1b. BOOTSTRAP DE VISIBILIDADE (idempotente)
--     Marca como visíveis os produtos ativos que NÃO são puros
--     componentes (Gelo/Carvão), para o cardápio já nascer populado.
--     Só roda se NENHUM produto foi marcado ainda — assim re-executar
--     a migração jamais desfaz escolhas manuais da administração.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE visivel_publico = TRUE LIMIT 1) THEN
    UPDATE public.produtos
      SET visivel_publico = TRUE
      WHERE status = 'ativo'
        AND COALESCE(categoria, '') NOT IN ('Gelo', 'Carvão');
  END IF;
END $$;

-- ============================================================
-- 2. SUBCATEGORIAS DE COPÃO (categorias desejadas no cardápio)
--    Usam a tabela categorias já existente. Não sobrescrevem nada.
-- ============================================================
INSERT INTO public.categorias (nome, emoji, ordem) VALUES
  ('Copões de Gin e Vodka', '🍸', 2),
  ('Copões de Whisky',      '🥃', 3),
  ('Copões Gourmet',        '🍽️', 4)
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- 3. VIEW SEGURA PARA O CARDÁPIO PÚBLICO
--    Expõe apenas colunas necessárias; ESCONDE preco_custo.
--    Filtra só produtos ativos. O site lê desta view.
--    Views rodam com privilégio do dono (postgres), contornando
--    o RLS de produtos, mas sem expôr custos nem dados internos.
-- ============================================================
CREATE OR REPLACE VIEW public.menu_publico AS
SELECT
  id,
  nome,
  categoria,
  preco_venda,
  estoque,
  status,
  foto_url,
  fotos_urls,
  descricao_publica,
  tamanho,
  combo_config,
  visivel_publico,
  created_at
FROM public.produtos
WHERE status = 'ativo';

-- A view roda como seu dono (postgres), contornando o RLS de produtos,
-- mas expondo apenas colunas seguras (sem preco_custo).
-- Garante o comportamento padrão (PG 15+):
ALTER VIEW public.menu_publico SET (security_invoker = false);

GRANT SELECT ON public.menu_publico TO anon, authenticated;

-- ============================================================
-- 4. TAMANHOS DE COPO CONFIGURÁVEIS
--    Substitui o array fixo TAMANHOS_COPO do app antigo.
--    A administração define label e preço extra de cada tamanho.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.copao_tamanhos (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  label       TEXT NOT NULL,
  preco_extra NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordem       INTEGER DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.copao_tamanhos DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.copao_tamanhos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copao_tamanhos TO authenticated;

-- Tamanhos padrão (iguais ao comportamento atual: 500ml e 700ml, sem extra)
INSERT INTO public.copao_tamanhos (label, preco_extra, ordem, ativo)
SELECT v.label, v.preco, v.ordem, TRUE
FROM (VALUES
  ('500 ml', 0, 1),
  ('700 ml', 0, 2)
) AS v(label, preco, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.copao_tamanhos WHERE label = v.label);

-- ============================================================
-- 5. SABORES DE COPÃO CONFIGURÁVEIS
--    A administração cadastra sabores (com preço extra opcional).
--    Pode restringir a uma categoria de copão (categoria_copao)
--    ou deixar NULL para aplicar a todos os copões.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.copao_sabores (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome            TEXT NOT NULL,
  categoria_copao TEXT,  -- ex.: 'Copões de Gin e Vodka' ou NULL = todos
  preco_extra     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordem           INTEGER DEFAULT 0,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.copao_sabores DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.copao_sabores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copao_sabores TO authenticated;

-- ============================================================
-- 6. CONFIGURAÇÕES DA LOJA (chave-valor)
--    WhatsApp, endereço, horário, entrega/retirada, identidade.
--    anon só lê; authenticated edita.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.loja_config (
  chave       TEXT PRIMARY KEY,
  valor       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.loja_config DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.loja_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loja_config TO authenticated;

-- Valores padrão (editáveis no painel admin)
INSERT INTO public.loja_config (chave, valor) VALUES
  ('nome_loja',        'Adega Corujão'),
  ('frase_identidade', 'A noite tem dono'),
  ('whatsapp',         '11957699647'),
  ('endereco',         'Avenida Prefeito Antônio Júlio Toledo Garcia Lopes, 1260, Atibaia – SP'),
  ('horario',          'Consultar pelo WhatsApp'),
  ('retirada',         'Retirada no local e entrega sob consulta'),
  ('aviso_cardapio',   '')
ON CONFLICT (chave) DO NOTHING;

-- Se já rodou a migração antes (campo whatsapp existe mas está vazio), preenche agora:
UPDATE public.loja_config
  SET valor = '11957699647'
  WHERE chave = 'whatsapp' AND (valor IS NULL OR valor = '');

-- ============================================================
-- 7. REFORÇAR LEITURA PÚBLICA DE categorias
--    (Já estava assim, mas garantimos para o cardápio.)
-- ============================================================
ALTER TABLE public.categorias DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.categorias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias TO authenticated;

-- ============================================================
-- FIM — verifique no SQL Editor se retornou sem erros.
-- Depois abra o painel admin (admin.html) para:
--   - preencher o número do WhatsApp;
--   - ligar a visibilidade dos produtos que vão ao cardápio;
--   - ajustar descrições, tamanhos, sabores e tamanhos de copo.
-- ============================================================
