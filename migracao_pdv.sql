-- ============================================================
-- MIGRAÇÃO PDV — Adega Corujão
-- Execute no SQL Editor do Supabase (supabase.com → seu projeto
-- → SQL Editor → New query → cole tudo → Run).
-- É seguro executar mais de uma vez (IF NOT EXISTS / OR REPLACE).
-- Preserva todos os dados existentes.
-- ============================================================

-- 1. Coluna combo_config em produtos
--    Guarda os grupos de escolha de cada combo em JSON.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS combo_config jsonb;

-- 2. Coluna componentes em itens_venda
--    Guarda quais produtos foram escolhidos em cada item de combo.
ALTER TABLE public.itens_venda
  ADD COLUMN IF NOT EXISTS componentes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Chave idempotente em vendas (evita duplicata por clique duplo)
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS chave_pdv uuid;

-- 4. Índice único parcial (ignora NULLs das vendas antigas)
CREATE UNIQUE INDEX IF NOT EXISTS vendas_chave_pdv_unique
  ON public.vendas (chave_pdv)
  WHERE chave_pdv IS NOT NULL;

-- 5. Permissões (caso RLS esteja ativo)
GRANT SELECT, INSERT, UPDATE ON public.produtos           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vendas             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.itens_venda        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.movimentacoes_estoque TO anon, authenticated;
GRANT SELECT, INSERT         ON public.gastos             TO anon, authenticated;

-- 6. Função transacional de finalização de venda
CREATE OR REPLACE FUNCTION public.finalizar_venda_pdv(
  p_chave     uuid,
  p_pagamento text,
  p_itens     jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale            uuid;
  v_item            jsonb;
  v_component       jsonb;
  v_group           jsonb;
  v_product         public.produtos%ROWTYPE;
  v_comp_product    public.produtos%ROWTYPE;
  v_qty             integer;
  v_comp_qty        integer;
  v_total           numeric(10,2) := 0;
  v_count           integer := 0;
  v_group_total     integer;
  v_all_components  jsonb;
  v_components      jsonb;
  v_item_cost       numeric(10,2);
  v_name            text;
  v_first_product   uuid;
  v_first_qty       integer;
  v_first_price     numeric(10,2);
  v_email           text;
  v_required        record;
BEGIN

  -- Autenticação
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Faça login para registrar vendas';
  END IF;

  -- Validação básica
  IF p_chave IS NULL OR p_pagamento NOT IN ('pix','dinheiro','debito','credito') THEN
    RAISE EXCEPTION 'Forma de pagamento ou identificador inválido';
  END IF;

  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Informe de 1 a 100 itens';
  END IF;

  -- Idempotência: evita duplicata por clique duplo
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave::text, 0));
  SELECT id INTO v_sale FROM public.vendas WHERE chave_pdv = p_chave;
  IF v_sale IS NOT NULL THEN RETURN v_sale; END IF;

  -- Bloqueia produtos em ordem estável (evita deadlock)
  PERFORM 1
  FROM public.produtos p
  WHERE p.id IN (
    SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(p_itens) x
    UNION
    SELECT (c->>'product_id')::uuid
      FROM jsonb_array_elements(p_itens) i,
           LATERAL jsonb_array_elements(COALESCE(i->'components','[]'::jsonb)) c
  )
  ORDER BY p.id FOR UPDATE;

  -- E-mail do usuário autenticado
  v_email := (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()));

  -- Cria cabeçalho da venda
  INSERT INTO public.vendas
    (chave_pdv, cliente_nome, forma_pagamento, administrador_id, administrador_email)
  VALUES
    (p_chave, 'Cliente balcão', p_pagamento, (SELECT auth.uid()), v_email)
  RETURNING id INTO v_sale;

  -- Processa cada item
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP

    IF jsonb_typeof(v_item) <> 'object'
       OR (v_item->>'quantity') !~ '^[1-9][0-9]{0,3}$'
       OR (v_item->>'product_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN
      RAISE EXCEPTION 'Item inválido no pedido';
    END IF;

    v_qty := (v_item->>'quantity')::integer;

    SELECT * INTO v_product
      FROM public.produtos
     WHERE id = (v_item->>'product_id')::uuid AND status = 'ativo';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível ou inativo'; END IF;
    IF v_product.preco_venda <= 0 THEN RAISE EXCEPTION 'Produto "%" sem preço', v_product.nome; END IF;

    v_all_components := COALESCE(v_item->'components', '[]'::jsonb);
    v_components     := '[]'::jsonb;
    v_item_cost      := 0;

    -- COMBO: valida grupos e acumula custo dos componentes
    IF v_product.combo_config IS NOT NULL
       AND jsonb_array_length(COALESCE(v_product.combo_config->'groups','[]'::jsonb)) > 0
    THEN
      -- Valida cada grupo (min/max)
      FOR v_group IN SELECT value FROM jsonb_array_elements(v_product.combo_config->'groups') LOOP
        v_group_total := 0;
        FOR v_component IN SELECT value FROM jsonb_array_elements(v_all_components) LOOP
          IF (v_component->>'product_id')::uuid = ANY (
               SELECT jsonb_array_elements_text(v_group->'options')::uuid)
          THEN
            v_group_total := v_group_total + (v_component->>'quantity')::integer;
          END IF;
        END LOOP;
        IF v_group_total < (v_group->>'min')::integer
           OR v_group_total > (v_group->>'max')::integer
        THEN
          RAISE EXCEPTION 'Escolhas inválidas no grupo "%": esperado % a %, recebido %',
            v_group->>'name', v_group->>'min', v_group->>'max', v_group_total;
        END IF;
      END LOOP;

      -- Valida e acumula componentes
      FOR v_component IN SELECT value FROM jsonb_array_elements(v_all_components) LOOP
        v_comp_qty := (v_component->>'quantity')::integer;
        SELECT * INTO v_comp_product
          FROM public.produtos
         WHERE id = (v_component->>'product_id')::uuid AND status = 'ativo';
        IF NOT FOUND THEN RAISE EXCEPTION 'Componente inativo ou inexistente'; END IF;
        IF v_comp_product.combo_config IS NOT NULL
           AND jsonb_array_length(COALESCE(v_comp_product.combo_config->'groups','[]'::jsonb)) > 0
        THEN RAISE EXCEPTION 'Componente "%" não pode ser um combo', v_comp_product.nome; END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_product.combo_config->'groups') g,
               LATERAL jsonb_array_elements_text(g->'options') AS opt(value)
          WHERE opt.value::uuid = v_comp_product.id
        ) THEN RAISE EXCEPTION 'Componente "%" não permitido neste combo', v_comp_product.nome; END IF;
        v_components := v_components || jsonb_build_array(
          jsonb_build_object('product_id', v_comp_product.id, 'name', v_comp_product.nome, 'quantity', v_comp_qty));
        v_item_cost := v_item_cost + v_comp_product.preco_custo * v_comp_qty;
      END LOOP;

    -- PRODUTO AVULSO
    ELSE
      IF jsonb_array_length(v_all_components) <> 0 THEN
        RAISE EXCEPTION 'Produto avulso não aceita componentes';
      END IF;
      v_item_cost := v_product.preco_custo;
    END IF;

    -- Insere item da venda
    INSERT INTO public.itens_venda
      (venda_id, produto_id, nome_produto, quantidade,
       preco_unitario, custo_unitario, subtotal, componentes)
    VALUES
      (v_sale, v_product.id, v_product.nome, v_qty,
       v_product.preco_venda, v_item_cost,
       v_product.preco_venda * v_qty, v_components);

    v_total := v_total + v_product.preco_venda * v_qty;
    v_count := v_count + v_qty;
    IF v_first_product IS NULL THEN
      v_first_product := v_product.id;
      v_first_qty     := v_qty;
      v_first_price   := v_product.preco_venda;
    END IF;

  END LOOP;

  -- Baixa de estoque transacional (agrega antes de atualizar)
  FOR v_required IN
    SELECT id, sum(qty)::integer AS qty
    FROM (
      -- Avulsos: baixa no produto
      SELECT (i->>'product_id')::uuid AS id, (i->>'quantity')::integer AS qty
        FROM jsonb_array_elements(p_itens) i
        JOIN public.produtos p ON p.id = (i->>'product_id')::uuid
       WHERE p.combo_config IS NULL
          OR jsonb_array_length(COALESCE(p.combo_config->'groups','[]'::jsonb)) = 0
      UNION ALL
      -- Combos: baixa nos componentes (qty item × qty componente)
      SELECT (c->>'product_id')::uuid,
             (i->>'quantity')::integer * (c->>'quantity')::integer
        FROM jsonb_array_elements(p_itens) i,
             LATERAL jsonb_array_elements(COALESCE(i->'components','[]'::jsonb)) c
    ) consumed
    GROUP BY id ORDER BY id
  LOOP
    UPDATE public.produtos
       SET estoque = estoque - v_required.qty
     WHERE id = v_required.id AND estoque >= v_required.qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%"',
        (SELECT nome FROM public.produtos WHERE id = v_required.id);
    END IF;
    SELECT nome INTO v_name FROM public.produtos WHERE id = v_required.id;
    INSERT INTO public.movimentacoes_estoque
      (produto_id, nome_produto, tipo, quantidade, motivo, administrador_id, administrador_email)
    VALUES (v_required.id, v_name, 'Saída', v_required.qty,
            'Venda ' || v_sale::text, (SELECT auth.uid()), v_email);
  END LOOP;

  -- Atualiza totais no cabeçalho
  UPDATE public.vendas
     SET valor_total    = v_total,
         quantidade     = v_count,
         produto_id     = CASE WHEN jsonb_array_length(p_itens) = 1 THEN v_first_product ELSE NULL END,
         produto_nome   = CASE
                            WHEN jsonb_array_length(p_itens) = 1 THEN
                              (SELECT nome FROM public.produtos WHERE id = v_first_product)
                            ELSE 'Venda com ' || jsonb_array_length(p_itens) || ' itens'
                          END,
         valor_unitario = CASE WHEN jsonb_array_length(p_itens) = 1 THEN v_first_price ELSE 0 END
   WHERE id = v_sale;

  RETURN v_sale;
END;
$$;

-- Permissões da função
REVOKE ALL    ON FUNCTION public.finalizar_venda_pdv(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_pdv(uuid, text, jsonb) TO authenticated;

-- ============================================================
-- FIM — verifique no SQL Editor se retornou sem erros.
-- ============================================================

-- ============================================================
-- MIGRAÇÃO: tabela de categorias dinâmicas
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  emoji TEXT DEFAULT '📦',
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categorias DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON categorias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON categorias TO authenticated;

INSERT INTO categorias (nome, emoji, ordem) VALUES
  ('Cervejas',      '🍺', 1),
  ('Copões',        '🍻', 2),
  ('Combos',        '🎁', 3),
  ('Destilados',    '🥃', 4),
  ('Doses',         '🥃', 5),
  ('Gourmet',       '🍽️', 6),
  ('Garrafas',      '🍾', 7),
  ('Refrigerantes', '🥤', 8),
  ('Energéticos',   '⚡', 9),
  ('Gelo',          '🧊', 10),
  ('Outros',        '📦', 11)
ON CONFLICT (nome) DO NOTHING;
