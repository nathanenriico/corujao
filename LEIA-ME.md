# Adega Corujão — Cardápio público de pedidos

Site público de pedidos integrado ao mesmo Supabase que já roda o sistema da
adega. O cliente escolhe a bebida, monta as opções e pede pelo WhatsApp — sem
criar conta. Os preços vêm sempre do banco, então qualquer alteração no
painel aparece no cardápio sem precisar publicar de novo.

> 🦉 Identidade preservada: fundo preto, cartões cinza escuro, roxo vibrante e
> a frase **“A noite tem dono”**.

---

## Arquivos deste projeto

| Arquivo | O que é |
|---|---|
| `index.html` + `app.js` + `style.css` | Cardápio público (o que o cliente acessa) |
| `admin.html` + `admin.js` + `admin.css` | Painel para a adega configurar o cardápio |
| `migracao_cardapio_publico.sql` | Migração para rodar no Supabase (uma vez) |
| `LEIA-ME.md` | Este guia |

Os arquivos do sistema atual (`app.js`, `index.html`, `style.css`,
`database.sql`, etc. do painel interno) **não são alterados**. Este projeto
adiciona o cardápio público ao lado do que já existe.

> **Leve e rápido**: o site público faz as consultas direto na API REST do
> Supabase com `fetch` (sem carregar a biblioteca `@supabase/supabase-js`,
> usada apenas no painel admin, que precisa de login). Imagens com
> `loading="lazy"` + `decoding="async"`, busca com debounce e grid que se
> adapta a qualquer largura de tela.

---

## Passo a passo

### 1. Rode a migração no Supabase

No Supabase do projeto atual: **SQL Editor → New query → cole o conteúdo de
`migracao_cardapio_publico.sql` → Run.**

A migração é segura (usa `IF NOT EXISTS` / `OR REPLACE`) e **não apaga nada**.
Ela cria:

- Campos em `produtos`: `visivel_publico`, `descricao_publica`, `tamanho`
- **View `menu_publico`** — expõe só colunas seguras e **esconde `preco_custo`**;
  filtra produtos ativos. É por ela que o site lê.
- Tabelas: `copao_tamanhos`, `copao_sabores`, `loja_config`
- Subcategorias de copão (`Copões de Gin e Vodka`, `Copões de Whisky`,
  `Copões Gourmet`) na tabela `categorias`
- Permissões: `anon` só lê; `authenticated` edita configurações.

### 2. Configure o WhatsApp e os dados da loja

Abra `admin.html` (publicado junto ou local) e entre com o **mesmo login do
sistema da adega**. Na aba **Loja**:

- **WhatsApp do pedido** → campo obrigatório. Coloque o número **somente com
  DDD** (ex.: `11999998888`). O site adiciona o `55` do Brasil
  automaticamente se faltar. **Não há telefone inventado no código.**
- Endereço, horário, retirada/entrega, nome da loja e frase de identidade.

### 3. Escolha o que aparece no cardápio

Após a migração, os produtos ativos já aparecem no cardápio, **exceto os
componentes** (Gelo, Carvão) — que ficam ocultos por padrão. Na aba
**Produtos** do painel você refina:

- Ligue/desligue **Visível no cardápio** por produto (nem todo item do estoque
  é vendido separadamente).
- Preencha **descrição curta** e **tamanho** (ex.: `600ml`, `2L`) que aparecem
  no cardápio.

> A migração só liga a visibilidade automaticamente se nenhum produto tiver sido
> marcado ainda. Depois disso, a escolha é sempre sua — re-executar a migração
> nunca desfaz o que você configurou.

As categorias (Cervejas, Copões de Gin e Vodka, Copões de Whisky, Copões
Gourmet, Combos, Refrigerantes, Energéticos, etc.) vêm da tabela `categorias`
do sistema. Crie/edite categorias pelo painel atual da adega.

### 4. Monte as opções de copão

Na aba **Copão** do painel:

- **Tamanhos de copo** — usados no “Monte seu Copão” (ex.: 500 ml, 700 ml),
  cada um com preço extra opcional. **Substitui os tamanhos fixos do código
  antigo** — agora é tudo administrável.
- **Sabores de copão** — sabores que o cliente pode escolher ao pedir um
  copão, com preço extra opcional. Pode restrigir a uma categoria de copão
  (ex.: só para “Copões de Gin e Vodka”) ou deixar para todos.

### 5. Publique

Coloque os arquivos no GitHub Pages (ou qualquer hospedagem estática). O
cardápio público é o `index.html`; o painel é o `admin.html`.

---

## Como o preço se mantém atualizado

- O cardápio lê a view `menu_publico` do Supabase (mesmo projeto do painel).
- Quando a adega muda preço/produto no painel atual, a alteração aparece no
  cardápio **sem republicar o site**. O cardápio também recarrega a cada
  60 s para manter tudo fresco.
- **Antes de abrir o WhatsApp**, o site consulta de novo os preços e a
  disponibilidade de tudo que está no pedido. Se algum valor mudou ou algum
  item saiu de estoque, o site mostra o **total atualizado** e os itens
  afetados e pede confirmação. Se não for possível consultar o banco, o
  pedido **não é enviado** — o site avisa que o cardápio está indisponível.

---

## Sobre o pedido pelo WhatsApp

Abrir o WhatsApp **não confirma** que a mensagem foi enviada, que o pagamento
ocorreu ou que a venda foi concluída. Por isso, esta ação:

- **Não registra venda** automaticamente
- **Não baixa estoque**

A confirmação e a baixa acontecem no sistema interno da adega, no fluxo de
atendimento, exatamente como hoje.

---

## Segurança dos dados

- O site público lê apenas o necessário: `menu_publico` (sem custo), categorias,
  tamanhos, sabores e configurações da loja.
- **Não expõe**: custo de compra, dados de clientes, vendas internas, credenciais
  administrativas nem permissões de alterar estoque. A view esconde `preco_custo`.
- O painel `admin.html` exige login (mesma conta do sistema da adega). Só
  autenticado edita configurações.

> A chave `anon` do Supabase fica no front-end (como já é o padrão do sistema
> atual). A proteção real dos dados sensíveis é feita por RLS e pela view. Se
> quiser travar ainda mais, crie uma role de leitura limitada — mas não é
> necessário para o uso normal.

---

## Testes recomendados (conferir antes de divulgar)

- [ ] Celular e desktop: sem rolagem horizontal, chips deslizam, botões grandes
- [ ] Navegação por categorias e busca por nome
- [ ] Pedido de produto simples: quantidade + observação
- [ ] Pedido de copão: sabores e adicionais somam corretamente
- [ ] Combo com `combo_config`: obriga o mínimo/máximo antes de adicionar
- [ ] Monte seu Copão: exige copão + tamanho do copo
- [ ] Carrinho: adicionar vários, alterar quantidades, remover
- [ ] Alterar o preço de um produto no Supabase e ver o cardápio refletir
- [ ] Zerar o estoque de um produto e ver “Esgotado”
- [ ] Sair do ar (desligar internet) e ver a mensagem de cardápio indisponível
- [ ] Mudar preço depois de montar o pedido: site mostra o novo total e pede
      confirmação antes de abrir o WhatsApp
- [ ] Mensagem do WhatsApp: nome, quantidade, sabores/adicionais, componentes,
      preço unitário, subtotal e total

---

## Endereço de referência

Avenida Prefeito Antônio Júlio Toledo Garcia Lopes, 1260, Atibaia – SP
(confira antes de publicar — é editável na aba Loja).
