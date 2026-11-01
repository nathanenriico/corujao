-- ============================================================
-- SISTEMA CORUJÃO - BANCO DE DADOS SUPABASE
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS produtos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  preco_venda NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_custo NUMERIC(10,2) NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_nome TEXT NOT NULL DEFAULT 'Cliente balcão',
  produto_id UUID REFERENCES produtos(id),
  produto_nome TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL,
  observacao TEXT,
  administrador_id UUID REFERENCES auth.users(id),
  administrador_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_venda (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venda_id UUID REFERENCES vendas(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id),
  nome_produto TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL,
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gastos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  descricao TEXT NOT NULL,
  produto_id UUID REFERENCES produtos(id),
  quantidade NUMERIC(10,2),
  valor_gasto NUMERIC(10,2) NOT NULL DEFAULT 0,
  fornecedor TEXT,
  observacao TEXT,
  atualizar_estoque BOOLEAN DEFAULT FALSE,
  administrador_id UUID REFERENCES auth.users(id),
  administrador_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  produto_id UUID REFERENCES produtos(id),
  nome_produto TEXT,
  tipo TEXT NOT NULL, -- 'entrada' ou 'saida'
  quantidade INTEGER NOT NULL,
  motivo TEXT,
  administrador_id UUID REFERENCES auth.users(id),
  administrador_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MIGRAÇÃO: tabela de fiados
-- Execute no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS fiados (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_nome TEXT NOT NULL,
  produto_nome TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  venda_id UUID REFERENCES vendas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' ou 'pago'
  pago_em TIMESTAMPTZ,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fiados DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON fiados TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON fiados TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE fiados;

-- ============================================================
-- MIGRAÇÃO: tabela de clientes
-- Execute no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  total_gasto NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_compras INTEGER NOT NULL DEFAULT 0,
  ultima_compra TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desabilitar RLS para acesso público (mesmo padrão das outras tabelas)
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;

-- Garantir permissões para o usuário anônimo
GRANT SELECT, INSERT, UPDATE, DELETE ON clientes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON clientes TO authenticated;

-- Adicionar à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE clientes;

-- ============================================================
-- MIGRAÇÃO: novos campos na tabela vendas (execute se já tinha o banco criado)
-- ============================================================
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cliente_nome TEXT NOT NULL DEFAULT 'Cliente balcão';
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id);
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS produto_nome TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) NOT NULL DEFAULT 0;
-- Renomear campo antigo 'total' para manter compatibilidade (opcional)
-- ALTER TABLE vendas RENAME COLUMN total TO valor_total_legado;

-- ============================================================
-- ACESSO PÚBLICO (sistema interno sem login)
-- Execute no SQL Editor do Supabase
-- ============================================================
ALTER TABLE produtos DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendas DISABLE ROW LEVEL SECURITY;
ALTER TABLE itens_venda DISABLE ROW LEVEL SECURITY;
ALTER TABLE gastos DISABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

-- Políticas: apenas usuários autenticados podem acessar

CREATE POLICY "Autenticados podem ver produtos" ON produtos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir produtos" ON produtos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem atualizar produtos" ON produtos
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem deletar produtos" ON produtos
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem ver vendas" ON vendas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir vendas" ON vendas
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem ver itens_venda" ON itens_venda
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir itens_venda" ON itens_venda
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem ver gastos" ON gastos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir gastos" ON gastos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem deletar gastos" ON gastos
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem ver movimentacoes" ON movimentacoes_estoque
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir movimentacoes" ON movimentacoes_estoque
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- REALTIME
-- Execute no SQL Editor para habilitar Realtime nas tabelas
-- ============================================================

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE produtos, vendas, itens_venda, gastos, movimentacoes_estoque;
COMMIT;

-- ============================================================
-- DADOS INICIAIS DE EXEMPLO (opcional)
-- ============================================================

INSERT INTO produtos (nome, categoria, preco_venda, preco_custo, estoque, estoque_minimo) VALUES
  ('Cerveja Original 600ml', 'Cervejas', 12.00, 7.00, 50, 10),
  ('Cerveja Heineken 600ml', 'Cervejas', 14.00, 8.50, 40, 10),
  ('Cerveja Brahma 350ml', 'Cervejas', 6.00, 3.50, 80, 20),
  ('Copão de Chope', 'Copões', 8.00, 4.00, 100, 20),
  ('Combo Casal (2 cervejas + petisco)', 'Combos', 28.00, 16.00, 20, 5),
  ('Cachaça 51 1L', 'Destilados', 35.00, 20.00, 15, 3),
  ('Whisky Johnnie Walker Red', 'Destilados', 120.00, 75.00, 8, 2),
  ('Coca-Cola 2L', 'Refrigerantes', 10.00, 6.00, 30, 10),
  ('Guaraná Antarctica 2L', 'Refrigerantes', 9.00, 5.50, 25, 10),
  ('Gelo 5kg', 'Gelo', 8.00, 4.00, 20, 5),
  ('Carvão 5kg', 'Carvão', 15.00, 9.00, 12, 3),
  ('Água Mineral 500ml', 'Outros', 3.00, 1.50, 60, 15),
  -- Energéticos (teste — substitua pelos reais depois)
  ('Energético Red Bull 250ml', 'Energéticos', 12.00, 7.00, 30, 5),
  ('Energético Monster 473ml', 'Energéticos', 14.00, 8.50, 25, 5),
  ('Energético TNT 269ml', 'Energéticos', 6.00, 3.50, 40, 10),
  -- Gelo (teste — substitua pelos reais depois)
  ('Gelo Triturado 1kg', 'Gelo', 3.00, 1.50, 50, 10),
  ('Gelo em Cubo 2kg', 'Gelo', 5.00, 2.50, 30, 8)
ON CONFLICT DO NOTHING;

-- ============================================================
-- MIGRAÇÃO: tabela de categorias dinâmicas
-- Execute no SQL Editor do Supabase
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

-- Categorias padrão do sistema
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

ALTER PUBLICATION supabase_realtime ADD TABLE categorias;
