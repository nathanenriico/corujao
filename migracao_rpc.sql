-- ============================================================
-- MIGRAÇÃO: RPC get_cardapio_publico
-- ------------------------------------------------------------
-- Substitui as 5 consultas paralelas do cardápio por uma única
-- chamada RPC. O Supabase executa no servidor e retorna tudo
-- em um JSON — 1 round-trip em vez de 5.
--
-- Execute no Supabase → SQL Editor → New query → Run.
-- É seguro executar mais de uma vez (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cardapio_publico()
RETURNS jsonb
LANGUAGE sql
STABLE        -- resultado consistente dentro da transação
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(

    -- Produtos visíveis (sem preco_custo nem created_at)
    'prods', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',               p.id,
          'nome',             p.nome,
          'categoria',        p.categoria,
          'preco_venda',      p.preco_venda,
          'estoque',          p.estoque,
          'status',           p.status,
          'foto_url',         p.foto_url,
          'fotos_urls',       p.fotos_urls,
          'descricao_publica',p.descricao_publica,
          'tamanho',          p.tamanho,
          'combo_config',     p.combo_config,
          'visivel_publico',  p.visivel_publico
        ) ORDER BY p.nome
      )
      FROM public.produtos p
      WHERE p.status = 'ativo'
    ),

    -- Categorias ativas
    'cats', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',    c.id,
          'nome',  c.nome,
          'emoji', c.emoji,
          'ordem', c.ordem
        ) ORDER BY c.ordem, c.nome
      )
      FROM public.categorias c
      WHERE c.ativo = true
    ),

    -- Tamanhos de copo
    'tams', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',         t.id,
          'label',      t.label,
          'preco_extra',t.preco_extra,
          'ordem',      t.ordem
        ) ORDER BY t.ordem
      )
      FROM public.copao_tamanhos t
      WHERE t.ativo = true
    ),

    -- Sabores de copão
    'sab', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',             s.id,
          'nome',           s.nome,
          'categoria_copao',s.categoria_copao,
          'preco_extra',    s.preco_extra,
          'ordem',          s.ordem
        ) ORDER BY s.ordem, s.nome
      )
      FROM public.copao_sabores s
      WHERE s.ativo = true
    ),

    -- Configurações da loja
    'cfg', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'chave', l.chave,
          'valor', l.valor
        )
      )
      FROM public.loja_config l
    )

  );
$$;

-- Permite leitura pública (anon) sem autenticação
GRANT EXECUTE ON FUNCTION public.get_cardapio_publico() TO anon, authenticated;

-- ============================================================
-- VERIFICAÇÃO (rode logo após para confirmar)
-- ============================================================
-- SELECT public.get_cardapio_publico();
