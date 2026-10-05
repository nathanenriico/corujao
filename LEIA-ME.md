# Adega Corujão — atualização do PDV

## O que foi feito

- Catálogo, carrinho com vários produtos, quatro formas de pagamento e histórico por item.
- Cadastro de combos com grupos configuráveis e escolha de componentes na venda.
- Baixa de estoque de componentes e produtos avulsos por função PostgreSQL transacional.
- Login por e-mail e senha do **mesmo projeto Supabase**. O vendedor não é escolhido na venda; a conta autenticada é registrada automaticamente.
- Relatório de custo baseado no valor registrado nos itens vendidos, inclusive componentes de combos novos.

## Instalação

1. **Faça uma cópia de segurança do banco** e confirme que o projeto Supabase em `app.js` é o projeto correto.
2. No **SQL Editor do projeto Supabase atual**, execute **apenas `migracao_pdv.sql`**. `database.sql` é uma cópia da estrutura anterior para consulta e não deve ser executado novamente para esta atualização.
3. Em Supabase **Authentication → Users**, garanta que os atendentes tenham contas de e-mail/senha. O sistema não oferece cadastro público de usuários.
4. Publique `index.html`, `style.css` e `app.js` juntos no mesmo diretório do site atual. Não publique `migracao_pdv.sql` no servidor web.
5. Entre com sua conta. Em **Produtos**, cadastre os produtos que serão usados como componentes, com seus estoques; depois crie ou edite um produto da categoria **Combos**, marque **Combo personalizável** e configure os grupos e opções. O preço do produto combo é o preço cobrado; o estoque físico é controlado nos componentes.

## Conferência sugerida

- Faça uma venda de dois produtos diferentes por Pix; confira uma venda em `vendas`, dois registros em `itens_venda` e a baixa no estoque.
- Monte dois combos com componentes diferentes; confira os componentes no histórico e a baixa de cada produto.
- Tente vender uma quantidade acima do estoque: a operação deve falhar sem criar venda nem baixar parte do estoque.
- Confira as opções Dinheiro, Débito e Crédito com vendas reais de teste, se a operação da loja permitir.

## Observações

- O sistema **registra a forma de pagamento escolhida**. Ele não gera cobrança Pix nem integra uma maquininha: a confirmação do recebimento é responsabilidade do operador.
- A migração acrescenta três colunas (`produtos.combo_config`, `itens_venda.componentes`, `vendas.chave_pdv`), um índice de unicidade e a função `finalizar_venda_pdv`; preserva os dados antigos.
- Como não há acesso ao projeto Supabase nesta entrega, a migração e as vendas não foram executadas contra o banco real. Execute a conferência acima em uma cópia ou ambiente de teste antes de substituir o site em uso.
- O `database.sql` original contém políticas e trechos históricos de migração. Não é o script de instalação desta atualização.
