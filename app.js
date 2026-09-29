// ============================================================
// CONFIGURAÇÃO SUPABASE
// ============================================================
const SUPABASE_URL = 'https://fykqqioozgotmmebtlix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// NAVEGAÇÃO ENTRE ABAS
// ============================================================
const navButtons = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab-content');

function switchTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}

navButtons.forEach(b => b.addEventListener('click', () => {
  switchTab(b.dataset.tab);
  if (b.dataset.tab === 'produtos')   loadProdutosList();
  if (b.dataset.tab === 'gastos')     { loadUltimasEntradas(); loadResumoEntradas(); }
  if (b.dataset.tab === 'dashboard')  loadDashboard();
  if (b.dataset.tab === 'relatorios') {
    const hoje = new Date().toISOString().split('T')[0];
    const inicioMes = hoje.slice(0, 7) + '-01';
    const ini = document.getElementById('rel-data-ini');
    const fim = document.getElementById('rel-data-fim');
    if (ini && !ini.value) ini.value = inicioMes;
    if (fim && !fim.value) fim.value = hoje;
  }
}));

// ============================================================
// DRAWER MOBILE — gaveta lateral do carrinho
// ============================================================
function abrirDrawer() {
  document.querySelector('.pdv-caixa')?.classList.add('drawer-aberto');
  document.getElementById('pdv-drawer-overlay')?.classList.add('overlay-ativo');
  document.body.style.overflow = 'hidden';
}

function fecharDrawer() {
  document.querySelector('.pdv-caixa')?.classList.remove('drawer-aberto');
  document.getElementById('pdv-drawer-overlay')?.classList.remove('overlay-ativo');
  document.body.style.overflow = '';
}

document.getElementById('btn-abrir-drawer')?.addEventListener('click', abrirDrawer);
document.getElementById('btn-fechar-drawer')?.addEventListener('click', fecharDrawer);
document.getElementById('pdv-drawer-overlay')?.addEventListener('click', fecharDrawer);

// ============================================================
// ESTADO GLOBAL E UTILITÁRIOS
// ============================================================
let products = [];

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
);

const toastEl = document.getElementById('toast');
function showToast(text, type = 'info') {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.className = `toast toast-${type}`;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 3800);
}

const productById = id => products.find(p => p.id === id);
const isCombo = p => !!(p?.combo_config?.groups?.length);

/** Texto resumido dos componentes de um item de combo */
function comboText(components) {
  return components
    .filter(c => c.quantity > 0)
    .map(c => `${c.name} × ${c.quantity}`)
    .join(' · ');
}

// ============================================================
// CATEGORIAS DINÂMICAS
// ============================================================
let categories = []; // { id, nome, emoji, ordem }

/** Emoji da categoria — usa o banco, depois fallback */
function categoryEmoji(categoria) {
  const cat = categories.find(c => c.nome === categoria);
  return cat?.emoji || '📦';
}

/** Categorias padrão usadas como fallback */
const CATEGORIAS_PADRAO = [
  { id: 'c1',  nome: 'Cervejas',      emoji: '🍺', ordem: 1  },
  { id: 'c2',  nome: 'Copões',        emoji: '🍻', ordem: 2  },
  { id: 'c3',  nome: 'Combos',        emoji: '🎁', ordem: 3  },
  { id: 'c4',  nome: 'Destilados',    emoji: '🥃', ordem: 4  },
  { id: 'c5',  nome: 'Doses',         emoji: '🥃', ordem: 5  },
  { id: 'c6',  nome: 'Gourmet',       emoji: '🍽️', ordem: 6 },
  { id: 'c7',  nome: 'Garrafas',      emoji: '🍾', ordem: 7  },
  { id: 'c8',  nome: 'Refrigerantes', emoji: '🥤', ordem: 8  },
  { id: 'c9',  nome: 'Energéticos',   emoji: '⚡', ordem: 9  },
  { id: 'c10', nome: 'Gelo',          emoji: '🧊', ordem: 10 },
  { id: 'c11', nome: 'Outros',        emoji: '📦', ordem: 11 },
];

/** Carrega categorias do banco e atualiza toda a UI */
async function loadCategorias() {
  try {
    const { data, error } = await client
      .from('categorias')
      .select('*')
      .eq('ativo', true)
      .order('ordem')
      .order('nome');

    categories = (!error && data?.length) ? data : CATEGORIAS_PADRAO;
    if (error) console.warn('Usando categorias padrão (execute o SQL de migração no Supabase).');
  } catch {
    categories = CATEGORIAS_PADRAO;
  }

  renderCategoryChips();
  renderCategoriasSelects();
  renderListaCategoriasModal();
}

/** Renderiza os chips de categoria na aba Vendas */
function renderCategoryChips() {
  const chips = document.getElementById('category-chips');
  if (!chips) return;
  const current = selectedCategory;
  chips.innerHTML = `<button class="chip ${!current ? 'active' : ''}" data-category="">Todos</button>` +
    categories.map(c =>
      `<button class="chip ${current === c.nome ? 'active' : ''}" data-category="${esc(c.nome)}">${c.emoji} ${esc(c.nome)}</button>`
    ).join('');
}

/** Preenche todos os <select> de categoria com as opções do banco */
function renderCategoriasSelects() {
  const nomes = categories.map(c => c.nome);

  // Select do modal de produto
  const selProd = document.getElementById('prod-categoria');
  if (selProd) {
    const atual = selProd.value;
    selProd.innerHTML = '<option value="">Selecione...</option>' +
      nomes.map(n => `<option value="${esc(n)}" ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  // Filtro de categoria na aba Produtos
  const selFiltro = document.getElementById('filtro-categoria-prod');
  if (selFiltro) {
    const atual = selFiltro.value;
    selFiltro.innerHTML = '<option value="">Todas as categorias</option>' +
      nomes.map(n => `<option value="${esc(n)}" ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  // Filtro de categoria em Relatórios
  const selRel = document.getElementById('rel-categoria');
  if (selRel) {
    const atual = selRel.value;
    selRel.innerHTML = '<option value="">Todas categorias</option>' +
      nomes.map(n => `<option value="${esc(n)}" ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }
}

/** Renderiza a lista de categorias dentro do modal de gestão */
function renderListaCategoriasModal() {
  const lista = document.getElementById('lista-categorias-modal');
  if (!lista) return;
  if (!categories.length) {
    lista.innerHTML = '<div class="empty-state" style="padding:12px">Nenhuma categoria ainda.</div>';
    return;
  }
  lista.innerHTML = categories.map(c => `
    <div class="cat-lista-item">
      <span class="cat-lista-emoji">${c.emoji}</span>
      <span class="cat-lista-nome">${esc(c.nome)}</span>
      <div class="cat-lista-acoes">
        <button type="button" class="btn-secondary btn-sm" data-cat-editar="${c.id}" title="Editar">✏️</button>
        <button type="button" class="btn-secondary btn-sm" data-cat-excluir="${c.id}" title="Excluir"
          style="color:var(--red);border-color:var(--red)">🗑️</button>
      </div>
    </div>`).join('');
}

/** Abre o modal de categorias */
function abrirModalCategoria(id = null) {
  const cat = id ? categories.find(c => c.id === id) : null;
  document.getElementById('modal-categoria-titulo').textContent = cat ? 'Editar Categoria' : 'Nova Categoria';
  document.getElementById('cat-id').value    = cat?.id    || '';
  document.getElementById('cat-nome').value  = cat?.nome  || '';
  document.getElementById('cat-emoji').value = cat?.emoji || '';
  renderListaCategoriasModal();
  document.getElementById('modal-categoria')?.classList.remove('hidden');
  document.getElementById('cat-nome')?.focus();
}

// Botão + no modal de produto abre o modal de categorias
document.getElementById('btn-nova-categoria-prod')?.addEventListener('click', () => abrirModalCategoria());

// Botão "Categoria" na aba Produtos abre o modal de categorias
document.getElementById('btn-nova-categoria')?.addEventListener('click', () => abrirModalCategoria());

// Submit do form de categoria
document.getElementById('form-categoria')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id    = document.getElementById('cat-id').value;
  const nome  = document.getElementById('cat-nome').value.trim();
  const emoji = document.getElementById('cat-emoji').value.trim() || '📦';
  if (!nome) return showToast('Informe o nome da categoria.', 'error');

  const payload = { nome, emoji };

  const { error } = id
    ? await client.from('categorias').update(payload).eq('id', id)
    : await client.from('categorias').insert([{ ...payload, ordem: categories.length + 1 }]);

  if (error) {
    console.error(error);
    if (error.code === '23505') return showToast('Essa categoria já existe.', 'error');
    if (error.code === '42P01') return showToast('Execute o SQL de migração no Supabase primeiro.', 'error');
    return showToast('Erro ao salvar categoria: ' + error.message, 'error');
  }

  showToast(id ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
  document.getElementById('cat-id').value    = '';
  document.getElementById('cat-nome').value  = '';
  document.getElementById('cat-emoji').value = '';
  document.getElementById('modal-categoria-titulo').textContent = 'Nova Categoria';
  await loadCategorias();
});

// Editar / excluir categorias na lista do modal
document.getElementById('lista-categorias-modal')?.addEventListener('click', async e => {
  const btnEditar  = e.target.closest('[data-cat-editar]');
  const btnExcluir = e.target.closest('[data-cat-excluir]');

  if (btnEditar) {
    abrirModalCategoria(btnEditar.dataset.catEditar);
    return;
  }

  if (btnExcluir) {
    const cat = categories.find(c => c.id === btnExcluir.dataset.catExcluir);
    if (!cat) return;
    if (!confirm(`Excluir a categoria "${cat.nome}"?\nProdutos nessa categoria não serão apagados.`)) return;
    const { error } = await client.from('categorias').delete().eq('id', cat.id);
    if (error) return showToast('Erro ao excluir categoria.', 'error');
    showToast('Categoria excluída!', 'success');
    await loadCategorias();
  }
});

// ============================================================
// CARREGAMENTO DE PRODUTOS
// ============================================================
async function loadProducts() {
  const { data, error } = await client.from('produtos').select('*').order('nome');
  if (error) { showToast('Não foi possível carregar os produtos.', 'error'); return; }
  products = data || [];
  renderSearchResults();
  popularSelectEntrada();
  renderDashEstoqueBaixo();
}

// ============================================================
// PDV — CATÁLOGO DE PRODUTOS (cards)
// ============================================================
const buscaInput    = document.getElementById('busca-produto');
const resultadosEl  = document.getElementById('resultados-busca');
const categoryChips = document.getElementById('category-chips');

let selectedCategory = '';

function renderSearchResults() {
  if (!resultadosEl) return;
  const q = (buscaInput?.value || '').trim().toLocaleLowerCase('pt-BR');

  const filtered = products.filter(p => {
    if (p.status !== 'ativo') return false;
    if (!p.nome.toLocaleLowerCase('pt-BR').includes(q)) return false;
    if (!selectedCategory) return true;                     // "Todos"
    if (selectedCategory === '__combos__') return isCombo(p); // chip Combos
    if (p.categoria === selectedCategory) return true;      // categoria específica
    if (isCombo(p)) return true;                            // combos aparecem em todas categorias
    return false;
  });

  // Combos primeiro, depois produtos normais por nome
  const sorted = [
    ...filtered.filter(p => isCombo(p)),
    ...filtered.filter(p => !isCombo(p)),
  ];

  if (!sorted.length) {
    resultadosEl.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>';
    return;
  }

  resultadosEl.innerHTML = sorted.map(p => {
    const combo    = isCombo(p);
    const semEst   = !combo && p.estoque <= 0;
    const baixo    = !combo && p.estoque > 0 && p.estoque <= p.estoque_minimo;
    const disabled = semEst ? 'disabled' : '';

    let estBadge, estClass;
    if (combo) {
      estBadge = '🎁 Personalizável'; estClass = 'combo';
    } else if (semEst) {
      estBadge = '🚨 Sem estoque'; estClass = 'zero';
    } else if (baixo) {
      estBadge = `⚠️ ${p.estoque} un`; estClass = 'low';
    } else {
      estBadge = `${p.estoque} un`; estClass = 'ok';
    }

    const imgUrl  = p.fotos_urls?.[0] || p.foto_url || '';
    const imgHtml = imgUrl
      ? `<div class="pdv-card-img"><img src="${esc(imgUrl)}" alt="${esc(p.nome)}" loading="lazy"
           onerror="this.parentElement.innerHTML='<span class=pdv-card-emoji>${categoryEmoji(p.categoria)}</span>'" /></div>`
      : `<div class="pdv-card-img"><span class="pdv-card-emoji">${categoryEmoji(p.categoria)}</span></div>`;

    return `
    <button type="button" class="pdv-card-btn${combo ? ' pdv-card-btn-combo' : ''}"
      data-id="${p.id}" ${disabled} aria-label="${esc(p.nome)}">
      ${combo
        ? '<span class="pdv-card-combo-badge">COMBO</span>'
        : `<span class="pdv-card-code">${esc(p.categoria)}</span>`}
      ${imgHtml}
      <span class="pdv-card-fav" aria-hidden="true">+</span>
      <div class="pdv-card-body">
        <div class="pdv-card-nome">${esc(p.nome)}</div>
        <span class="pdv-card-estoque ${estClass}">${estBadge}</span>
        <div class="pdv-card-preco">${fmt(p.preco_venda)}</div>
      </div>
    </button>`;
  }).join('');
}

buscaInput?.addEventListener('input', renderSearchResults);

categoryChips?.addEventListener('click', e => {
  const btn = e.target.closest('[data-category]');
  if (!btn) return;
  selectedCategory = btn.dataset.category;
  categoryChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === btn));
  renderSearchResults();
});

// Chip especial "Combos" — filtra só produtos com combo_config
const chipCombos = categoryChips?.querySelector('[data-category="Combos"]');
if (chipCombos) {
  chipCombos.addEventListener('click', () => {
    // Se clicar em "Combos", mostrar apenas combos reais (com groups)
    selectedCategory = '__combos__';
    categoryChips.querySelectorAll('.chip').forEach(c =>
      c.classList.toggle('active', c === chipCombos)
    );
    renderSearchResults();
  }, { capture: true }); // captura antes do listener genérico
}

resultadosEl?.addEventListener('click', e => {
  const btn = e.target.closest('[data-id]');
  if (!btn || saleBusy) return;
  const p = productById(btn.dataset.id);
  if (!p) return;
  if (isCombo(p)) return openCombo(p);
  if (p.estoque <= 0) return showToast('Produto sem estoque disponível.', 'error');

  // Se já está no carrinho (sem componentes), incrementa
  const current = cart.find(x => !x.components.length && x.product_id === p.id);
  if (current) {
    current.quantity++;
  } else {
    cart.push({ key: crypto.randomUUID(), product_id: p.id, quantity: 1, components: [] });
  }
  renderCart();
});

// ============================================================
// PDV — CARRINHO
// ============================================================
let cart     = [];
let payment  = '';
let saleBusy = false;
let saleKey  = crypto.randomUUID();

const btnRegistrar = document.getElementById('btn-registrar-venda');

function renderCart() {
  const listEl    = document.getElementById('pdv-itens');
  const contagemEl = document.getElementById('pdv-contagem');
  const totalEl   = document.getElementById('pdv-total');
  if (!listEl) return;

  const totalQty   = cart.reduce((n, i) => n + i.quantity, 0);
  const totalValor = cart.reduce((s, i) => s + (+productById(i.product_id)?.preco_venda || 0) * i.quantity, 0);

  if (contagemEl) contagemEl.textContent = `${totalQty} ${totalQty === 1 ? 'item' : 'itens'}`;
  if (totalEl)    totalEl.textContent = fmt(totalValor);

  // Total inline no botão finalizar
  const btnTotalInline = document.getElementById('btn-total-inline');
  if (btnTotalInline) btnTotalInline.textContent = fmt(totalValor);

  // Contador no rodapé
  const contagemRodape = document.getElementById('pdv-contagem-rodape');
  if (contagemRodape) contagemRodape.textContent = `${totalQty} ${totalQty === 1 ? 'produto' : 'produtos'}`;

  // Badge mobile no botão "Carrinho"
  const mobileBadge = document.getElementById('pdv-mobile-badge');
  if (mobileBadge) {
    mobileBadge.textContent = totalQty;
    mobileBadge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
  }

  // FAB mobile (botão flutuante abre drawer)
  const fab      = document.getElementById('btn-abrir-drawer');
  const fabBadge = document.getElementById('fab-badge');
  const fabTotal = document.getElementById('fab-total');
  if (fab) fab.classList.toggle('fab-oculto', totalQty === 0);
  if (fabBadge) fabBadge.textContent = totalQty;
  if (fabTotal) fabTotal.textContent = fmt(totalValor);

  if (!cart.length) {
    listEl.innerHTML = `
      <div class="pdv-carrinho-vazio">
        <span class="pdv-vazio-icon">🛒</span>
        <p>Selecione os produtos ao lado.</p>
      </div>`;
  } else {
    listEl.innerHTML = cart.map(item => {
      const p = productById(item.product_id);
      const subtotal = (+p?.preco_venda || 0) * item.quantity;

      // componentes do combo para exibição
      const compDisplay = item.components.length
        ? item.components
            .filter(c => c.quantity > 0)
            .map(c => ({ ...c, name: productById(c.product_id)?.nome || c.name || 'Produto' }))
        : [];

      return `
      <div class="carrinho-item" data-key="${item.key}">
        <div class="carrinho-item-top">
          <div class="carrinho-item-info">
            <div class="carrinho-item-nome">${esc(p?.nome || 'Produto indisponível')}</div>
            <div class="carrinho-item-preco">${fmt(p?.preco_venda)} / un</div>
            ${compDisplay.length
              ? `<small class="pdv-composicao">${esc(comboText(compDisplay))}</small>`
              : ''}
            ${item.tamanho
              ? `<small class="pdv-composicao">🥤 ${esc(item.tamanho)}</small>`
              : ''}
          </div>
          <div class="carrinho-item-subtotal">${fmt(subtotal)}</div>
        </div>
        <div class="carrinho-item-bottom">
          <div class="carrinho-qty">
            <button type="button" class="qty-btn" data-action="dec" aria-label="Diminuir">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button type="button" class="qty-btn" data-action="inc" aria-label="Aumentar">+</button>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${item.components.length
              ? `<button type="button" class="btn-editar-combo" data-action="edit">✏️ Editar</button>`
              : ''}
            <button type="button" class="btn-remove-item" data-action="remove" aria-label="Remover item">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  if (btnRegistrar) btnRegistrar.disabled = !cart.length || !payment || saleBusy;
}

document.getElementById('pdv-itens')?.addEventListener('click', e => {
  const button = e.target.closest('[data-action]');
  if (!button || saleBusy) return;
  const itemEl = button.closest('[data-key]');
  if (!itemEl) return;
  const item = cart.find(x => x.key === itemEl.dataset.key);
  if (!item) return;

  const action = button.dataset.action;
  if (action === 'edit')   return openCombo(productById(item.product_id), item);
  if (action === 'remove') { cart = cart.filter(x => x !== item); }
  else if (action === 'dec') {
    if (item.quantity <= 1) cart = cart.filter(x => x !== item);
    else item.quantity--;
  }
  else if (action === 'inc') { item.quantity++; }

  renderCart();
});

// Botão cancelar — limpa o carrinho
document.getElementById('btn-cancelar-venda')?.addEventListener('click', () => {
  if (!cart.length) return;
  if (!confirm('Limpar o carrinho?')) return;
  cart    = [];
  payment = '';
  saleKey = crypto.randomUUID();
  document.querySelectorAll('#pdv-pagamentos button').forEach(b => b.classList.remove('active'));
  fecharDrawer();
  renderCart();
});

// Seleção de pagamento
document.getElementById('pdv-pagamentos')?.addEventListener('click', e => {
  const button = e.target.closest('[data-pagamento]');
  if (!button || saleBusy) return;
  payment = button.dataset.pagamento;
  document.querySelectorAll('#pdv-pagamentos button').forEach(b =>
    b.classList.toggle('active', b === button)
  );
  renderCart();
});

// ============================================================
// PDV — FINALIZAR VENDA (inserção direta, sem RPC)
// ============================================================
btnRegistrar?.addEventListener('click', async () => {
  if (saleBusy || !cart.length || !payment) return;
  saleBusy = true;
  renderCart();
  btnRegistrar.textContent = 'Registrando…';

  try {
    const totalVenda = cart.reduce(
      (s, i) => s + (+productById(i.product_id)?.preco_venda || 0) * i.quantity, 0
    );

    // Monta resumo do primeiro item para os campos legados da tabela vendas
    const primeiroItem  = cart[0];
    const primeiroProd  = productById(primeiroItem.product_id);

    // 1. Inserir registro principal na tabela vendas
    const { data: vendaData, error: vendaError } = await client
      .from('vendas')
      .insert([{
        cliente_nome:    'Cliente balcão',
        produto_id:      primeiroProd?.id   || null,
        produto_nome:    cart.length === 1
          ? primeiroProd?.nome || 'Produto'
          : `${primeiroProd?.nome || 'Produto'} + ${cart.length - 1} item(s)`,
        quantidade:      cart.reduce((s, i) => s + i.quantity, 0),
        valor_unitario:  primeiroProd?.preco_venda || 0,
        valor_total:     totalVenda,
        forma_pagamento: payment,
      }])
      .select('id')
      .single();

    if (vendaError) throw vendaError;

    const vendaId = vendaData.id;

    // 2. Inserir cada item em itens_venda com nome e valor corretos
    const itensPayload = cart.flatMap(item => {
      const prod = productById(item.product_id);
      if (!prod) return [];

      // Se tem componentes (combo), registra cada componente
      if (item.components?.length) {
        return item.components
          .filter(c => c.quantity > 0)
          .map(c => {
            const compProd = productById(c.product_id);
            return {
              venda_id:       vendaId,
              produto_id:     c.product_id || null,
              nome_produto:   compProd?.nome || c.name || 'Componente',
              quantidade:     c.quantity * item.quantity,
              preco_unitario: compProd?.preco_venda || 0,
              custo_unitario: compProd?.preco_custo || 0,
              subtotal:       (compProd?.preco_venda || 0) * c.quantity * item.quantity,
            };
          });
      }

      // Item normal
      return [{
        venda_id:       vendaId,
        produto_id:     prod.id,
        nome_produto:   prod.nome,
        quantidade:     item.quantity,
        preco_unitario: prod.preco_venda,
        custo_unitario: prod.preco_custo || 0,
        subtotal:       prod.preco_venda * item.quantity,
      }];
    });

    if (itensPayload.length > 0) {
      const { error: itensError } = await client
        .from('itens_venda')
        .insert(itensPayload);
      if (itensError) throw itensError;
    }

    // 3. Atualizar estoque de cada produto vendido
    const estoqueUpdates = cart.map(async item => {
      const prod = productById(item.product_id);
      if (!prod || isCombo(prod)) return;
      const novoEstoque = Math.max(0, prod.estoque - item.quantity);
      await client.from('produtos').update({ estoque: novoEstoque }).eq('id', prod.id);
    });
    await Promise.all(estoqueUpdates);

    showToast(`✅ Venda registrada! ${fmt(totalVenda)}`, 'success');

    // Limpar carrinho
    cart     = [];
    payment  = '';
    saleKey  = crypto.randomUUID();
    document.querySelectorAll('#pdv-pagamentos button').forEach(b => b.classList.remove('active'));
    fecharDrawer();

    await Promise.all([
      loadProducts(),
      loadUltimasVendas(),
      loadDashboard(),
    ]);

  } catch (err) {
    console.error('Erro ao registrar venda:', err);
    showToast(err.message || 'Erro ao registrar venda.', 'error');
  } finally {
    saleBusy = false;
    btnRegistrar.textContent = 'Finalizar venda';
    renderCart();
  }
});

// ============================================================
// PDV — COMBO (modal de montagem)
// ============================================================
let comboDraft = null;

function openCombo(p, original = null) {
  if (!p) return;
  comboDraft = {
    product:   p,
    original,
    selection: Object.fromEntries(
      (original?.components || []).map(c => [c.product_id, c.quantity])
    ),
  };

  // Cabeçalho: nome + preço
  const titleEl = document.getElementById('montar-combo-titulo');
  const precoEl = document.getElementById('montar-combo-preco');
  if (titleEl) titleEl.textContent = p.nome.toUpperCase();
  if (precoEl) precoEl.textContent = fmt(p.preco_venda);

  // Imagem do combo
  const imgEl = document.getElementById('montar-combo-img');
  if (imgEl) {
    const imgUrl = p.fotos_urls?.[0] || p.foto_url || '';
    imgEl.innerHTML = imgUrl
      ? `<img src="${esc(imgUrl)}" alt="${esc(p.nome)}"
           onerror="this.parentElement.innerHTML='<span style=font-size:32px>🎁</span>'" />`
      : `<span style="font-size:32px">${categoryEmoji(p.categoria)}</span>`;
  }

  document.getElementById('modal-montar-combo')?.classList.remove('hidden');
  renderComboDraft();
}

function renderComboDraft() {
  if (!comboDraft) return;
  const container = document.getElementById('montar-combo-grupos');
  if (!container) return;

  container.innerHTML = comboDraft.product.combo_config.groups.map((g) => {
    const chosen = g.options.reduce((s, id) => s + (comboDraft.selection[id] || 0), 0);
    const req    = g.required !== false;
    const minEff = req ? Math.max(g.min, 1) : g.min;
    const maxEff = g.max >= 999 ? Infinity : g.max;
    const ok     = chosen >= minEff && (maxEff === Infinity || chosen <= maxEff);
    const maxLabel = maxEff === Infinity ? '∞' : g.max;

    return `
    <div class="combo-grupo-section">
      <!-- Nome do grupo + contador estilo imagem -->
      <div class="combo-grupo-nome-row">
        <span class="combo-grupo-nome">${esc(g.name).toUpperCase()}</span>
        <span class="combo-grupo-contador ${ok ? 'contador-ok' : ''}">${chosen} de ${maxLabel}</span>
      </div>

      <!-- Lista de opções -->
      ${g.options.map(id => {
        const op     = productById(id);
        const qty    = comboDraft.selection[id] || 0;
        const semEst = op && op.estoque <= 0;
        const imgUrl = op?.fotos_urls?.[0] || op?.foto_url || '';

        return `
        <div class="combo-opcao-item ${semEst ? 'opcao-sem-estoque' : ''}">

          <!-- Foto do produto -->
          <div class="combo-opcao-foto">
            ${imgUrl
              ? `<img src="${esc(imgUrl)}" alt="${esc(op?.nome || '')}"
                   onerror="this.parentElement.innerHTML='<span>${categoryEmoji(op?.categoria)}</span>'" />`
              : `<span>${categoryEmoji(op?.categoria)}</span>`}
          </div>

          <!-- Nome -->
          <div class="combo-opcao-nome-bloco">
            <span class="combo-opcao-nome-txt">${esc(op?.nome || 'Produto indisponível')}</span>
            ${semEst ? '<span class="combo-opcao-sem-est">Sem estoque</span>' : ''}
          </div>

          <!-- Controles verticais: + / qty / − -->
          <div class="combo-opcao-ctrl">
            <button class="combo-ctrl-btn" type="button"
              data-choice="${id}" data-step="1"
              ${semEst ? 'disabled' : ''}>+</button>
            <span class="combo-ctrl-qty">${qty}</span>
            <button class="combo-ctrl-btn combo-ctrl-minus" type="button"
              data-choice="${id}" data-step="-1"
              ${qty <= 0 ? 'disabled' : ''}>−</button>
          </div>

        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  // Valida e atualiza botão
  const invalidos = comboDraft.product.combo_config.groups.filter(g => {
    const chosen = g.options.reduce((s, id) => s + (comboDraft.selection[id] || 0), 0);
    const minEff = (g.required !== false) ? Math.max(g.min, 1) : g.min;
    const maxEff = g.max >= 999 ? Infinity : g.max;
    return chosen < minEff || (maxEff !== Infinity && chosen > maxEff);
  });

  const totalEscolhido = Object.values(comboDraft.selection).reduce((s, q) => s + q, 0);
  const totalMin = comboDraft.product.combo_config.groups
    .filter(g => g.required !== false)
    .reduce((s, g) => s + Math.max(g.min, 1), 0);

  const ajudaEl = document.getElementById('montar-combo-ajuda');
  const btnOk   = document.getElementById('btn-confirmar-combo');

  if (invalidos.length) {
    const g      = invalidos[0];
    const minEff = (g.required !== false) ? Math.max(g.min, 1) : g.min;
    const chosen = g.options.reduce((s, id) => s + (comboDraft.selection[id] || 0), 0);
    if (ajudaEl) ajudaEl.textContent = `${totalEscolhido}/${totalMin} · Complete "${g.name}"`;
    if (btnOk) btnOk.disabled = true;
  } else {
    if (ajudaEl) ajudaEl.textContent = `${totalEscolhido} item${totalEscolhido !== 1 ? 's' : ''} · Adicionar`;
    if (btnOk) btnOk.disabled = false;
  }
}

document.getElementById('montar-combo-grupos')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-choice]');
  if (!btn || !comboDraft) return;

  const id    = btn.dataset.choice;
  const delta = +btn.dataset.step;
  const g     = comboDraft.product.combo_config.groups.find(g => g.options.includes(id));
  if (!g) return;

  const current = comboDraft.selection[id] || 0;
  const maxEff  = g.max >= 999 ? Infinity : g.max;
  const groupTotal = g.options.reduce((s, opt) => s + (comboDraft.selection[opt] || 0), 0);

  if (current + delta < 0) return;
  if (delta > 0 && maxEff !== Infinity && groupTotal >= maxEff) return;

  if (delta > 0) {
    const prod = productById(id);
    if (prod && prod.estoque <= 0) return;
  }

  comboDraft.selection[id] = current + delta;
  renderComboDraft();
});

document.getElementById('btn-confirmar-combo')?.addEventListener('click', () => {
  const btnOk = document.getElementById('btn-confirmar-combo');
  if (!comboDraft || btnOk?.disabled) return;

  const components = Object.entries(comboDraft.selection)
    .filter(([, q]) => q > 0)
    .map(([product_id, quantity]) => ({ product_id, quantity }));

  if (comboDraft.original) {
    // Edição: atualiza componentes do item já no carrinho
    comboDraft.original.components = components;
  } else {
    cart.push({
      key:        crypto.randomUUID(),
      product_id: comboDraft.product.id,
      quantity:   1,
      components,
    });
  }

  comboDraft = null;
  document.getElementById('modal-montar-combo')?.classList.add('hidden');
  renderCart();
});

// ============================================================
// ÚLTIMAS VENDAS DO DIA
// ============================================================
const listaUltimas  = document.getElementById('lista-ultimas-vendas');
const totalHojeEl   = document.getElementById('total-hoje-vendas');

async function loadUltimasVendas() {
  const hoje = new Date().toISOString().split('T')[0];
  const { data, error } = await client
    .from('vendas')
    .select('*')
    .gte('created_at', `${hoje}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error(error); return; }

  const total = (data || []).reduce((s, v) => s + Number(v.valor_total || 0), 0);
  if (totalHojeEl) totalHojeEl.textContent = `${fmt(total)} hoje`;

  if (!listaUltimas) return;
  if (!data?.length) {
    listaUltimas.innerHTML = '<div class="empty-state">Nenhuma venda hoje ainda.</div>';
    return;
  }

  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳' };
  listaUltimas.innerHTML = data.map(v => `
    <div class="ultima-venda-item">
      <div class="uv-left">
        <span class="uv-cliente">${esc(v.cliente_nome || 'Cliente balcão')}</span>
        <span class="uv-produto">${esc(v.produto_nome || '')} × ${v.quantidade}</span>
      </div>
      <div class="uv-right">
        <span class="uv-valor">${fmt(v.valor_total)}</span>
        <span class="uv-pag">${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento}</span>
      </div>
    </div>`).join('');

  updateDashToday(total);
}

// ============================================================
// DASHBOARD
// ============================================================
function updateDashToday(total) {
  const el = document.getElementById('dash-hoje');
  if (el) el.textContent = fmt(total);
}

async function loadDashboard() {
  const hoje       = new Date().toISOString().split('T')[0];
  const inicioSem  = new Date();
  inicioSem.setDate(inicioSem.getDate() - inicioSem.getDay());
  const inicioMes  = hoje.slice(0, 7) + '-01';

  const [{ data: dHoje }, { data: dSemana }, { data: dMes }, { data: dUltimas }] = await Promise.all([
    client.from('vendas').select('valor_total').gte('created_at', `${hoje}T00:00:00`),
    client.from('vendas').select('valor_total').gte('created_at', inicioSem.toISOString()),
    client.from('vendas').select('valor_total').gte('created_at', `${inicioMes}T00:00:00`),
    client.from('vendas').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  const soma = arr => (arr || []).reduce((s, v) => s + Number(v.valor_total), 0);
  const elHoje   = document.getElementById('dash-hoje');
  const elSemana = document.getElementById('dash-semana');
  const elMes    = document.getElementById('dash-mes');
  if (elHoje)   elHoje.textContent   = fmt(soma(dHoje));
  if (elSemana) elSemana.textContent = fmt(soma(dSemana));
  if (elMes)    elMes.textContent    = fmt(soma(dMes));

  renderDashUltimasVendas(dUltimas || []);
  renderDashMaisVendidos();
  renderDashEstoqueBaixo();
}

function renderDashUltimasVendas(vendas) {
  const lista = document.getElementById('dash-ultimas-vendas');
  if (!lista) return;
  if (!vendas.length) { lista.innerHTML = '<div class="empty-state">Nenhuma venda ainda.</div>'; return; }
  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳' };
  lista.innerHTML = vendas.map(v => `
    <div class="venda-dash-item">
      <div>
        <div style="font-size:14px;font-weight:600">${esc(v.cliente_nome || 'Cliente balcão')}</div>
        <div class="venda-dash-info">${esc(v.produto_nome || '')} × ${v.quantidade} • ${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento} • ${new Date(v.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <div class="venda-dash-total">${fmt(v.valor_total)}</div>
    </div>`).join('');
}

async function renderDashMaisVendidos() {
  const lista = document.getElementById('dash-mais-vendidos');
  if (!lista) return;
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01';
  const { data, error } = await client
    .from('vendas')
    .select('produto_nome,quantidade,valor_total,itens_venda(nome_produto,quantidade,subtotal)')
    .gte('created_at', `${inicioMes}T00:00:00`);
  if (error || !data?.length) {
    lista.innerHTML = '<div class="empty-state">Nenhuma venda no mês.</div>';
    return;
  }
  const mapa = {};
  data.forEach(v =>
    (v.itens_venda?.length
      ? v.itens_venda
      : [{ nome_produto: v.produto_nome, quantidade: v.quantidade, subtotal: v.valor_total }]
    ).forEach(i => {
      const name = i.nome_produto || 'Desconhecido';
      if (!mapa[name]) mapa[name] = { qty: 0, total: 0 };
      mapa[name].qty   += Number(i.quantidade);
      mapa[name].total += Number(i.subtotal);
    })
  );
  lista.innerHTML = Object.entries(mapa)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([name, d], i) =>
      `<div class="rank-item">
        <span class="rank-pos">${i + 1}°</span>
        <span class="rank-nome">${esc(name)}</span>
        <span class="rank-qtd">${d.qty} un</span>
        <span class="rank-valor">${fmt(d.total)}</span>
      </div>`
    ).join('');
}

function renderDashEstoqueBaixo() {
  const lista  = document.getElementById('dash-alerta-estoque');
  const badge  = document.getElementById('dash-estoque-baixo');
  const totalEl= document.getElementById('dash-total-estoque');
  if (!lista) return;

  const baixos = products.filter(p => p.status === 'ativo' && !isCombo(p) && p.estoque <= p.estoque_minimo);
  if (badge) badge.textContent = baixos.length;

  const totalEstoque = products.filter(p => p.status === 'ativo').reduce((s, p) => s + p.estoque, 0);
  if (totalEl) totalEl.textContent = totalEstoque.toLocaleString('pt-BR');

  if (!baixos.length) {
    lista.innerHTML = '<div class="empty-state">✅ Todos os produtos com estoque ok.</div>';
    return;
  }
  lista.innerHTML = baixos.map(p => {
    const zero = p.estoque <= 0;
    return `
    <div class="alerta-item ${zero ? 'alerta-item-zero' : ''}">
      <span class="alerta-nome">${esc(p.nome)}</span>
      <span class="alerta-estoque">${zero ? '🚨 Sem estoque' : `⚠️ ${p.estoque} / mín ${p.estoque_minimo}`}</span>
    </div>`;
  }).join('');
}

// ============================================================
// AVISOS DE ESTOQUE MÍNIMO — desativados por solicitação
// ============================================================
let alertasMostrados = new Set();
function verificarEstoqueMinimo() { /* desativado */ }
function showAlertaEstoque() { /* desativado */ }

// ============================================================
// ABA ENTRADAS DE MERCADORIAS
// ============================================================
function popularSelectEntrada() {
  const sel = document.getElementById('entrada-produto');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">📦 Selecione o produto...</option>' +
    products.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  sel.value = atual;
}

function recalcEntrada() {
  const qty  = parseFloat(document.getElementById('entrada-quantidade')?.value) || 0;
  const unit = parseFloat(document.getElementById('entrada-valor-unit')?.value) || 0;
  const el   = document.getElementById('entrada-total');
  if (el) el.textContent = fmt(qty * unit);
}

document.getElementById('entrada-quantidade')?.addEventListener('input', recalcEntrada);
document.getElementById('entrada-valor-unit')?.addEventListener('input', recalcEntrada);

document.getElementById('btn-registrar-entrada')?.addEventListener('click', async () => {
  const prodId    = document.getElementById('entrada-produto')?.value;
  const qty       = parseInt(document.getElementById('entrada-quantidade')?.value) || 0;
  const valorUnit = parseFloat(document.getElementById('entrada-valor-unit')?.value) || 0;
  const fornecedor= document.getElementById('entrada-fornecedor')?.value.trim() || '';
  const obs       = document.getElementById('entrada-obs')?.value.trim() || '';

  if (!prodId)        return showToast('Selecione um produto', 'error');
  if (qty < 1)        return showToast('Informe a quantidade', 'error');
  if (valorUnit <= 0) return showToast('Informe o valor unitário', 'error');

  const prod = products.find(p => p.id === prodId);
  if (!prod) return;
  const valorTotal = qty * valorUnit;

  const btn = document.getElementById('btn-registrar-entrada');
  btn.disabled = true;

  const { error: gastoErr } = await client.from('gastos').insert([{
    descricao: `Entrada: ${prod.nome}`,
    produto_id: prodId,
    quantidade: qty,
    valor_gasto: valorTotal,
    fornecedor,
    observacao: obs,
    atualizar_estoque: true,
  }]);

  if (gastoErr) {
    btn.disabled = false;
    console.error(gastoErr);
    return showToast('Erro ao registrar entrada', 'error');
  }

  const { data: prodAtual } = await client.from('produtos').select('estoque').eq('id', prodId).single();
  const novoEstoque = (prodAtual?.estoque || 0) + qty;
  await client.from('produtos').update({ estoque: novoEstoque, preco_custo: valorUnit }).eq('id', prodId);

  await client.from('movimentacoes_estoque').insert([{
    produto_id:    prodId,
    nome_produto:  prod.nome,
    tipo:          'Entrada',
    quantidade:    qty,
    motivo:        fornecedor ? `Compra - ${fornecedor}` : 'Entrada de mercadoria',
  }]);

  showToast('Mercadoria registrada com sucesso', 'success');
  limparEntrada();
  await Promise.all([loadProducts(), loadUltimasEntradas(), loadResumoEntradas()]);
  btn.disabled = false;
});

function limparEntrada() {
  ['entrada-produto', 'entrada-fornecedor', 'entrada-quantidade', 'entrada-valor-unit', 'entrada-obs']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = id === 'entrada-quantidade' ? '1' : '';
    });
  const totalEl = document.getElementById('entrada-total');
  if (totalEl) totalEl.textContent = fmt(0);
}

async function loadUltimasEntradas() {
  const lista = document.getElementById('lista-ultimas-entradas');
  if (!lista) return;
  const { data } = await client.from('gastos').select('*').order('created_at', { ascending: false }).limit(10);
  if (!data?.length) { lista.innerHTML = '<div class="empty-state">Nenhuma entrada ainda.</div>'; return; }
  lista.innerHTML = data.map(g => `
    <div class="ultima-venda-item">
      <div class="uv-icon">📦</div>
      <div class="uv-left">
        <span class="uv-cliente">${esc(g.descricao)}</span>
        <span class="uv-produto">${esc(g.fornecedor || 'Sem fornecedor')} · ${g.quantidade} un · ${new Date(g.created_at).toLocaleDateString('pt-BR')}</span>
      </div>
      <div class="uv-right">
        <span class="uv-valor" style="color:var(--orange)">${fmt(g.valor_gasto)}</span>
      </div>
    </div>`).join('');
}

async function loadResumoEntradas() {
  const hoje     = new Date().toISOString().split('T')[0];
  const inicioMes= hoje.slice(0, 7) + '-01';
  const [{ data: dHoje }, { data: dMes }] = await Promise.all([
    client.from('gastos').select('valor_gasto').gte('created_at', `${hoje}T00:00:00`),
    client.from('gastos').select('valor_gasto').gte('created_at', `${inicioMes}T00:00:00`),
  ]);
  const somaHoje = (dHoje || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const somaMes  = (dMes  || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const elHoje = document.getElementById('entrada-hoje');
  const elMes  = document.getElementById('entrada-mes');
  if (elHoje) elHoje.textContent = fmt(somaHoje);
  if (elMes)  elMes.textContent  = fmt(somaMes);
  const dashGastos = document.getElementById('dash-gastos');
  if (dashGastos) dashGastos.textContent = fmt(somaMes);
}

// ============================================================
// ABA PRODUTOS — listagem
// ============================================================
let prodViewMode  = 'cards';
let prodFilterCat = '';

document.getElementById('btn-toggle-view')?.addEventListener('click', () => {
  prodViewMode = prodViewMode === 'cards' ? 'tabela' : 'cards';
  document.getElementById('btn-toggle-view').textContent = prodViewMode === 'cards' ? '📋 Tabela' : '📦 Cards';
  renderProdutosList();
});

async function loadProdutosList() {
  const lista = document.getElementById('lista-produtos');
  if (!lista) return;
  lista.innerHTML = '<div class="loading">Carregando…</div>';
  const { data, error } = await client.from('produtos').select('*').order('nome');
  if (error) { lista.innerHTML = '<div class="empty-state">Erro ao carregar produtos.</div>'; return; }
  products = data || [];
  renderProdutosList();
}

function renderProdutosList() {
  const lista = document.getElementById('lista-produtos');
  if (!lista) return;
  const q   = (document.getElementById('busca-produto-lista')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('filtro-categoria-prod')?.value || '';
  const filtered = products.filter(p =>
    p.nome.toLowerCase().includes(q) && (!cat || p.categoria === cat)
  );

  // Alterna classe para desativar o grid quando em modo tabela
  lista.classList.toggle('lista-produtos-tabela', prodViewMode === 'tabela');

  if (!filtered.length) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>'; return; }

  if (prodViewMode === 'tabela') {
    lista.innerHTML = `
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2)">
        <table class="tabela-produtos">
          <colgroup>
            <col class="col-nome" />
            <col class="col-cat" />
            <col class="col-venda" />
            <col class="col-custo" />
            <col class="col-estoque" />
            <col class="col-status" />
            <col class="col-acoes" />
          </colgroup>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Venda</th>
              <th>Custo</th>
              <th>Estoque</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(p => {
              const ec = isCombo(p) ? 'estoque-ok' : p.estoque <= 0 ? 'estoque-zero' : p.estoque <= p.estoque_minimo ? 'estoque-baixo' : 'estoque-ok';
              const el = isCombo(p) ? 'Sob demanda' : p.estoque <= 0 ? '🚨 0 un' : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque}/${p.estoque_minimo}` : `${p.estoque} un`;
              return `
              <tr>
                <td class="td-nome">${esc(p.nome)}</td>
                <td><span class="produto-categoria">${esc(p.categoria)}</span></td>
                <td style="color:var(--green);font-weight:600">${fmt(p.preco_venda)}</td>
                <td style="color:var(--text2)">${fmt(p.preco_custo)}</td>
                <td><span class="estoque-badge ${ec}">${el}</span></td>
                <td>${p.status === 'inativo' ? '<span class="inativo-badge">Inativo</span>' : '<span style="color:var(--green);font-size:11px;font-weight:600">● Ativo</span>'}</td>
                <td class="td-acoes" style="display:flex;gap:5px">
                  <button class="btn-secondary btn-sm" data-action="editar"  data-id="${p.id}" title="Editar">✏️</button>
                  <button class="btn-secondary btn-sm" data-action="estoque" data-id="${p.id}" title="Estoque">📦</button>
                  <button class="btn-secondary btn-sm" data-action="excluir" data-id="${p.id}" title="Excluir" style="color:var(--red);border-color:var(--red)">🗑️</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    return;
  }

  // modo cards
  lista.innerHTML = filtered.map(p => {
    const ec  = isCombo(p) ? 'estoque-ok' : p.estoque <= 0 ? 'estoque-zero' : p.estoque <= p.estoque_minimo ? 'estoque-baixo' : 'estoque-ok';
    const el  = isCombo(p) ? 'Sob demanda' : p.estoque <= 0 ? '🚨 Sem estoque' : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque} un` : `${p.estoque} un`;
    const fotos = (p.fotos_urls?.length ? p.fotos_urls : (p.foto_url ? [p.foto_url] : []));

    let fotoHtml = '';
    if (fotos.length === 1) {
      fotoHtml = `<div class="produto-item-img"><img src="${esc(fotos[0])}" alt="${esc(p.nome)}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>`;
    } else if (fotos.length > 1) {
      const slides = fotos.map((url, i) =>
        `<div class="carrossel-slide${i === 0 ? ' ativo' : ''}"><img src="${esc(url)}" alt="${esc(p.nome)} ${i+1}" onerror="this.parentElement.style.display='none'" /></div>`
      ).join('');
      const dots = fotos.map((_, i) =>
        `<button class="carrossel-dot${i === 0 ? ' ativo' : ''}" data-idx="${i}"></button>`
      ).join('');
      fotoHtml = `
        <div class="produto-item-img carrossel" data-pid="${p.id}">
          <div class="carrossel-track">${slides}</div>
          <button class="carrossel-btn carrossel-prev" data-dir="-1">&#8249;</button>
          <button class="carrossel-btn carrossel-next" data-dir="1">&#8250;</button>
          <div class="carrossel-dots">${dots}</div>
          <span class="carrossel-counter">1 / ${fotos.length}</span>
        </div>`;
    }

    return `
    <div class="produto-item">
      ${fotoHtml}
      <div class="produto-item-body">
        <div class="produto-item-header">
          <span class="produto-nome">${esc(p.nome)}</span>
          <span class="produto-categoria">${esc(p.categoria)}</span>
        </div>
        <div class="produto-precos">
          <span>Venda: <strong>${fmt(p.preco_venda)}</strong></span>
          <span class="custo">Custo: <strong>${fmt(p.preco_custo)}</strong></span>
        </div>
        <div class="produto-estoque-row">
          <span class="estoque-badge ${ec}">${el}</span>
          ${p.status === 'inativo' ? '<span class="inativo-badge">Inativo</span>' : ''}
        </div>
        <div class="produto-acoes">
          <button class="btn-secondary btn-sm" data-action="editar"  data-id="${p.id}">✏️ Editar</button>
          <button class="btn-secondary btn-sm" data-action="estoque" data-id="${p.id}">📦 Estoque</button>
          <button class="btn-secondary btn-sm" data-action="excluir" data-id="${p.id}" style="color:var(--red);border-color:var(--red)">🗑️ Excluir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('lista-produtos')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'editar')  abrirModalProduto(id);
  if (btn.dataset.action === 'estoque') abrirModalEstoque(id);
  if (btn.dataset.action === 'excluir') excluirProduto(id);
});

// Carrossel de fotos
document.getElementById('lista-produtos')?.addEventListener('click', e => {
  const btnNav = e.target.closest('.carrossel-btn');
  const btnDot = e.target.closest('.carrossel-dot');
  const carr   = (btnNav || btnDot)?.closest('.carrossel');
  if (!carr) return;
  e.stopPropagation();

  const slides  = carr.querySelectorAll('.carrossel-slide');
  const dots    = carr.querySelectorAll('.carrossel-dot');
  const counter = carr.querySelector('.carrossel-counter');
  const total   = slides.length;
  let atual     = [...slides].findIndex(s => s.classList.contains('ativo'));

  if (btnDot)  atual = parseInt(btnDot.dataset.idx);
  else atual = (atual + parseInt(btnNav.dataset.dir) + total) % total;

  slides.forEach((s, i) => s.classList.toggle('ativo', i === atual));
  dots.forEach((d, i)   => d.classList.toggle('ativo', i === atual));
  if (counter) counter.textContent = `${atual + 1} / ${total}`;
});

document.getElementById('busca-produto-lista')?.addEventListener('input',   renderProdutosList);
document.getElementById('filtro-categoria-prod')?.addEventListener('change', renderProdutosList);

// ============================================================
// MODAL PRODUTO — upload de imagens + abrir / salvar / excluir
// ============================================================

// Estado das fotos no modal
let uploadFotosPendentes = []; // { file, dataUrl } — novas fotos a enviar
let uploadFotosExistentes = []; // URLs já salvas no banco

/** Renderiza os previews de fotos no modal */
function renderUploadPreviews() {
  const container = document.getElementById('upload-previews');
  const placeholder = document.getElementById('upload-placeholder');
  if (!container) return;

  const todas = [
    ...uploadFotosExistentes.map(url => ({ tipo: 'existente', url })),
    ...uploadFotosPendentes.map(f   => ({ tipo: 'nova', url: f.dataUrl, file: f.file })),
  ];

  if (placeholder) placeholder.style.display = todas.length ? 'none' : 'flex';

  container.innerHTML = todas.map((f, i) => `
    <div class="upload-preview-item" data-idx="${i}" data-tipo="${f.tipo}">
      <img src="${esc(f.url)}" alt="Foto ${i + 1}" />
      <button type="button" class="upload-preview-remove" data-idx="${i}" data-tipo="${f.tipo}" aria-label="Remover foto">✕</button>
    </div>`).join('');
}

// Clique na área de upload → abre file picker
document.getElementById('upload-area')?.addEventListener('click', e => {
  if (e.target.closest('.upload-preview-remove')) return;
  document.getElementById('prod-fotos')?.click();
});

// Seleção de arquivos
document.getElementById('prod-fotos')?.addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast(`"${file.name}" ultrapassa 5 MB.`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      uploadFotosPendentes.push({ file, dataUrl: ev.target.result });
      renderUploadPreviews();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = ''; // permite re-selecionar o mesmo arquivo
});

// Remover foto do preview
document.getElementById('upload-previews')?.addEventListener('click', e => {
  const btn = e.target.closest('.upload-preview-remove');
  if (!btn) return;
  const idx  = +btn.dataset.idx;
  const tipo = btn.dataset.tipo;
  const existLen = uploadFotosExistentes.length;

  if (tipo === 'existente') {
    uploadFotosExistentes.splice(idx, 1);
  } else {
    uploadFotosPendentes.splice(idx - existLen, 1);
  }
  renderUploadPreviews();
});

/** Faz upload das fotos pendentes para o Supabase Storage e retorna as URLs */
async function uploadFotos(produtoId) {
  const urls = [];
  for (const { file } of uploadFotosPendentes) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${produtoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await client.storage
      .from('produtos')
      .upload(path, file, { upsert: false, contentType: file.type });

    if (error) {
      console.error('Erro upload:', error);
      showToast(`Erro ao enviar "${file.name}": ${error.message}`, 'error');
      continue;
    }

    const { data } = client.storage.from('produtos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

function abrirModalProduto(id = null) {
  const modal = document.getElementById('modal-produto');
  if (!modal) return;
  const p = id ? products.find(x => x.id === id) : null;

  document.getElementById('modal-produto-titulo').textContent = p ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('prod-id').value            = p?.id || '';
  document.getElementById('prod-nome').value          = p?.nome || '';
  document.getElementById('prod-categoria').value     = p?.categoria || '';
  document.getElementById('prod-preco-venda').value   = p?.preco_venda || '';
  document.getElementById('prod-preco-custo').value   = p?.preco_custo || '';
  document.getElementById('prod-estoque').value       = p?.estoque ?? '';
  document.getElementById('prod-estoque-min').value   = p?.estoque_minimo ?? '';
  document.getElementById('prod-status').value        = p?.status || 'ativo';

  // Carrega fotos existentes do produto
  uploadFotosPendentes  = [];
  uploadFotosExistentes = p?.fotos_urls?.length
    ? [...p.fotos_urls]
    : p?.foto_url ? [p.foto_url] : [];
  renderUploadPreviews();

  modal.classList.remove('hidden');
}

document.getElementById('btn-novo-produto')?.addEventListener('click', () => abrirModalProduto());

document.getElementById('form-produto')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id  = document.getElementById('prod-id').value;
  const btn = e.target.querySelector('[type=submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  try {
    // Se é novo produto, cria primeiro para ter o ID do upload
    let produtoId = id;
    if (!produtoId) {
      const { data: novo, error: novoErr } = await client
        .from('produtos')
        .insert([{
          nome:           document.getElementById('prod-nome').value.trim(),
          categoria:      document.getElementById('prod-categoria').value,
          preco_venda:    parseFloat(document.getElementById('prod-preco-venda').value) || 0,
          preco_custo:    parseFloat(document.getElementById('prod-preco-custo').value) || 0,
          estoque:        parseInt(document.getElementById('prod-estoque').value) || 0,
          estoque_minimo: parseInt(document.getElementById('prod-estoque-min').value) || 0,
          status:         document.getElementById('prod-status').value,
          combo_config:   null,
        }])
        .select('id')
        .single();
      if (novoErr) throw novoErr;
      produtoId = novo.id;
    }

    // Faz upload das fotos novas
    const urlsNovas = uploadFotosPendentes.length
      ? await uploadFotos(produtoId)
      : [];

    // Une existentes + novas
    const todasUrls = [...uploadFotosExistentes, ...urlsNovas];

    // Monta payload de atualização
    const payload = {
      combo_config:   null,
      nome:           document.getElementById('prod-nome').value.trim(),
      categoria:      document.getElementById('prod-categoria').value,
      preco_venda:    parseFloat(document.getElementById('prod-preco-venda').value) || 0,
      preco_custo:    parseFloat(document.getElementById('prod-preco-custo').value) || 0,
      estoque:        parseInt(document.getElementById('prod-estoque').value) || 0,
      estoque_minimo: parseInt(document.getElementById('prod-estoque-min').value) || 0,
      status:         document.getElementById('prod-status').value,
      fotos_urls:     todasUrls,
      foto_url:       todasUrls[0] || null,
    };

    const { error: updErr } = await client
      .from('produtos')
      .update(payload)
      .eq('id', produtoId);
    if (updErr) throw updErr;

    document.getElementById('modal-produto')?.classList.add('hidden');
    showToast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
    await loadProdutosList();
    renderSearchResults();

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao salvar produto.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
});

async function excluirProduto(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return;

  await Promise.all([
    client.from('vendas').update({ produto_id: null }).eq('produto_id', id),
    client.from('itens_venda').update({ produto_id: null }).eq('produto_id', id),
    client.from('gastos').update({ produto_id: null }).eq('produto_id', id),
    client.from('movimentacoes_estoque').update({ produto_id: null }).eq('produto_id', id),
  ]);

  const { error } = await client.from('produtos').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Erro ao excluir produto', 'error'); }
  showToast('Produto excluído!', 'success');
  await loadProdutosList();
  renderSearchResults();
}

// ============================================================
// MODAL AJUSTE DE ESTOQUE
// ============================================================
function abrirModalEstoque(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const modal = document.getElementById('modal-estoque');
  if (!modal) return;
  document.getElementById('estoque-produto-id').value    = p.id;
  document.getElementById('estoque-produto-nome').textContent = p.nome;
  document.getElementById('estoque-quantidade').value   = '';
  document.getElementById('estoque-motivo').value       = '';
  document.getElementById('estoque-tipo').value         = 'entrada';
  modal.classList.remove('hidden');
}

document.getElementById('form-estoque')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id     = document.getElementById('estoque-produto-id').value;
  const tipo   = document.getElementById('estoque-tipo').value;
  const qty    = parseInt(document.getElementById('estoque-quantidade').value) || 0;
  const motivo = document.getElementById('estoque-motivo').value || 'Ajuste manual';
  if (qty < 1) return showToast('Informe a quantidade', 'error');
  const p = products.find(x => x.id === id);
  if (!p) return;
  const novoEstoque = tipo === 'entrada' ? p.estoque + qty : Math.max(0, p.estoque - qty);
  const { error } = await client.from('produtos').update({ estoque: novoEstoque }).eq('id', id);
  if (error) { console.error(error); return showToast('Erro ao ajustar estoque', 'error'); }
  await client.from('movimentacoes_estoque').insert([{
    produto_id:   id,
    nome_produto: p.nome,
    tipo:         tipo === 'entrada' ? 'Entrada' : 'Saída',
    quantidade:   qty,
    motivo,
  }]);
  document.getElementById('modal-estoque')?.classList.add('hidden');
  showToast('Estoque atualizado!', 'success');
  await loadProdutosList();
  renderSearchResults();
});

// ============================================================
// RELATÓRIOS
// ============================================================
document.getElementById('btn-gerar-relatorio')?.addEventListener('click', gerarRelatorio);

async function gerarRelatorio() {
  const ini         = document.getElementById('rel-data-ini')?.value;
  const fim         = document.getElementById('rel-data-fim')?.value;
  const catFilt     = document.getElementById('rel-categoria')?.value || '';
  const pagFilt     = document.getElementById('rel-pagamento')?.value || '';
  const prodFilt    = (document.getElementById('rel-produto')?.value || '').toLowerCase();
  const clienteFilt = (document.getElementById('rel-cliente')?.value || '').toLowerCase();

  if (!ini || !fim) return showToast('Selecione o período', 'error');

  const btn = document.getElementById('btn-gerar-relatorio');
  btn.textContent = 'Gerando…';
  btn.disabled    = true;

  let qVendas = client
    .from('vendas')
    .select('*,itens_venda(produto_id,nome_produto,quantidade,preco_unitario,custo_unitario,subtotal,componentes)')
    .gte('created_at', `${ini}T00:00:00`)
    .lte('created_at', `${fim}T23:59:59`);
  if (pagFilt) qVendas = qVendas.eq('forma_pagamento', pagFilt);

  const [{ data: vendas }, { data: gastos }] = await Promise.all([
    qVendas,
    client.from('gastos').select('valor_gasto')
      .gte('created_at', `${ini}T00:00:00`)
      .lte('created_at', `${fim}T23:59:59`),
  ]);

  btn.textContent = 'Gerar';
  btn.disabled    = false;

  let vendasFilt = (vendas || []).filter(v => {
    const p = products.find(x => x.id === v.produto_id);
    if (catFilt && !(v.itens_venda?.length
      ? v.itens_venda.some(i => products.find(x => x.id === i.produto_id)?.categoria === catFilt)
      : p?.categoria === catFilt)) return false;
    if (prodFilt && !(v.itens_venda?.length
      ? v.itens_venda.some(i => i.nome_produto?.toLowerCase().includes(prodFilt))
      : (v.produto_nome || '').toLowerCase().includes(prodFilt))) return false;
    if (clienteFilt && !(v.cliente_nome || '').toLowerCase().includes(clienteFilt)) return false;
    return true;
  });

  const totalVendido = vendasFilt.reduce((s, v) => s + Number(v.valor_total), 0);
  const totalGastos  = (gastos || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const custoVendas  = vendasFilt.reduce((s, v) => {
    const p = products.find(x => x.id === v.produto_id);
    return s + (v.itens_venda?.length
      ? v.itens_venda.reduce((n, i) => n + Number(i.custo_unitario) * Number(i.quantidade), 0)
      : Number(p?.preco_custo || 0) * Number(v.quantidade));
  }, 0);
  const lucro = totalVendido - custoVendas - totalGastos;

  document.getElementById('rel-total-vendido').textContent  = fmt(totalVendido);
  document.getElementById('rel-custo').textContent          = fmt(custoVendas);
  document.getElementById('rel-gastos-periodo').textContent = fmt(totalGastos);
  document.getElementById('rel-lucro').textContent          = fmt(lucro);
  document.getElementById('rel-resumo').classList.remove('hidden');

  // Por pagamento
  const porPag = {};
  vendasFilt.forEach(v => {
    const k = v.forma_pagamento || 'outros';
    porPag[k] = (porPag[k] || 0) + Number(v.valor_total);
  });
  document.getElementById('rel-pagamento-lista').innerHTML = Object.entries(porPag)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <div class="rel-row">
        <span class="rel-label" style="text-transform:capitalize">${k}</span>
        <span class="rel-valor">${fmt(v)}</span>
      </div>`).join('') || '<div class="empty-state">Sem dados.</div>';
  document.getElementById('rel-por-pagamento').classList.remove('hidden');

  // Por produto
  const porProd = {};
  vendasFilt.forEach(v => {
    (v.itens_venda?.length
      ? v.itens_venda
      : [{ nome_produto: v.produto_nome, quantidade: v.quantidade, subtotal: v.valor_total }]
    ).forEach(i => {
      const nome = i.nome_produto || 'Desconhecido';
      if (!porProd[nome]) porProd[nome] = { qty: 0, total: 0 };
      porProd[nome].qty   += Number(i.quantidade);
      porProd[nome].total += Number(i.subtotal);
    });
  });
  document.getElementById('rel-produto-lista').innerHTML = Object.entries(porProd)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nome, d]) => `
      <div class="rel-row">
        <span class="rel-label">${esc(nome)}</span>
        <span style="font-size:13px;color:var(--text2)">${d.qty} un</span>
        <span class="rel-valor">${fmt(d.total)}</span>
      </div>`).join('') || '<div class="empty-state">Sem dados.</div>';
  document.getElementById('rel-por-produto').classList.remove('hidden');
  document.getElementById('rel-exportar').classList.remove('hidden');

  // Vendas detalhadas
  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳' };
  document.getElementById('rel-vendas-lista').innerHTML = vendasFilt.length
    ? vendasFilt.map(v => `
      <div class="historico-item">
        <div class="historico-item-header">
          <span class="hist-cliente">${esc(v.cliente_nome || 'Cliente balcão')}</span>
          <span class="hist-total">${fmt(v.valor_total)}</span>
        </div>
        <div class="hist-produto">
          ${(v.itens_venda?.length
            ? v.itens_venda
            : [{ nome_produto: v.produto_nome, quantidade: v.quantidade, componentes: [] }]
          ).map(i =>
            `${esc(i.nome_produto)} × ${i.quantidade}` +
            (i.componentes?.length
              ? `<br><small class="pdv-composicao">${esc(comboText(i.componentes))}</small>`
              : '')
          ).join('<br>')}
        </div>
        <div class="hist-info">
          <span>${new Date(v.created_at).toLocaleString('pt-BR')}</span>
          <span class="badge-pagamento">${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento}</span>
          ${v.administrador_email ? `<span>👤 ${esc(v.administrador_email)}</span>` : ''}
        </div>
      </div>`).join('')
    : '<div class="empty-state">Nenhuma venda no período.</div>';
  document.getElementById('rel-vendas-detalhadas').classList.remove('hidden');

  window._relDados = { vendasFilt, ini, fim, totalVendido, custoVendas, totalGastos, lucro, porPag, porProd };
}

// Exportar Excel
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
  const d = window._relDados;
  if (!d) return;
  const rows = d.vendasFilt.map(v => ({
    Data:        new Date(v.created_at).toLocaleString('pt-BR'),
    Cliente:     v.cliente_nome || 'Cliente balcão',
    Produto:     v.produto_nome || '',
    Quantidade:  v.quantidade,
    'Valor Total': Number(v.valor_total),
    Pagamento:   v.forma_pagamento,
    Vendedor:    v.administrador_email || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
  XLSX.writeFile(wb, `relatorio_${d.ini}_${d.fim}.xlsx`);
});

// Exportar PDF
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
  const d = window._relDados;
  if (!d) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Relatório ${d.ini} a ${d.fim}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Total Vendido: ${fmt(d.totalVendido)}`,     14, 30);
  doc.text(`Custo dos Produtos: ${fmt(d.custoVendas)}`, 14, 38);
  doc.text(`Gastos no Período: ${fmt(d.totalGastos)}`,  14, 46);
  doc.text(`Lucro Estimado: ${fmt(d.lucro)}`,           14, 54);
  doc.setFontSize(13);
  doc.text('Vendas por Produto', 14, 66);
  doc.setFontSize(10);
  let y = 74;
  Object.entries(d.porProd).sort((a, b) => b[1].total - a[1].total).forEach(([nome, v]) => {
    doc.text(`${nome} — ${v.qty} un — ${fmt(v.total)}`, 14, y);
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save(`relatorio_${d.ini}_${d.fim}.pdf`);
});

// ============================================================
// FECHAR MODAIS
// ============================================================
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () =>
    document.getElementById(btn.dataset.close)?.classList.add('hidden')
  );
});
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ============================================================
// REALTIME
// ============================================================
let _realtimeChannel = null;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const _debouncedUltimasVendas  = debounce(loadUltimasVendas,  300);
const _debouncedDashboard      = debounce(loadDashboard,       600);
const _debouncedUltimasEntradas= debounce(loadUltimasEntradas, 300);
const _debouncedResumoEntradas = debounce(loadResumoEntradas,  600);
const _debouncedProdutosList   = debounce(renderProdutosList,  300);

function onProdutoChange(payload) {
  const novo = payload.new;
  if (!novo) return;
  const idx = products.findIndex(p => p.id === novo.id);
  if (idx !== -1) products[idx] = { ...products[idx], ...novo };
  else products.push(novo);
  renderSearchResults();
  renderCart();
  renderDashEstoqueBaixo();
  verificarEstoqueMinimo();
  _debouncedProdutosList();
}

function setupRealtime() {
  if (_realtimeChannel) {
    client.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  _realtimeChannel = client.channel('adega-realtime', {
    config: { broadcast: { self: false } },
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendas' }, () => {
    _debouncedUltimasVendas();
    _debouncedDashboard();
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gastos' }, () => {
    _debouncedUltimasEntradas();
    _debouncedResumoEntradas();
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gastos' }, () => {
    _debouncedUltimasEntradas();
    _debouncedResumoEntradas();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, onProdutoChange)
  .subscribe(status => {
    if (status === 'SUBSCRIBED') console.log('✅ Realtime conectado');
    if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
      console.warn('⚠️ Realtime desconectado, reconectando em 4s…');
      setTimeout(setupRealtime, 4000);
    }
  });
}

// ============================================================
// COMBO PERSONALIZADO — montagem livre na aba de vendas
// ============================================================

/**
 * Estado do combo personalizado.
 * customDraft = {
 *   grupos: [ { id, label, emoji, categorias, required, max, selecao: {prodId: qty} } ],
 *   tamanho: null | { label, precoExtra }
 * }
 */
let customDraft = null;

// Tamanhos disponíveis do copo
const TAMANHOS_COPO = [
  { label: '500 ml', precoExtra: 0 },
  { label: '700 ml', precoExtra: 0 },
];

/** Monta os grupos dinamicamente com base nos produtos cadastrados */
function buildCustomGrupos() {
  const ativos = products.filter(p => p.status === 'ativo' && !isCombo(p));

  const porCategoria = cat => ativos.filter(p => p.categoria === cat);

  // Grupo Copões — sempre incluído
  const copoes = porCategoria('Copões');

  // Grupo Energéticos — sempre incluído (mesmo vazio, aparece para aviso)
  const energeticos = porCategoria('Energéticos');

  // Grupo Gelo
  const gelo = porCategoria('Gelo');

  const grupos = [];

  if (copoes.length || true) {
    grupos.push({
      id: 'copoes',
      label: 'Copão',
      emoji: '🍻',
      produtos: copoes,
      required: false,
      max: 10,
      selecao: {},
    });
  }

  if (energeticos.length || true) {
    grupos.push({
      id: 'energeticos',
      label: 'Energético',
      emoji: '⚡',
      produtos: energeticos,
      required: false,
      max: 10,
      selecao: {},
    });
  }

  if (gelo.length || true) {
    grupos.push({
      id: 'gelo',
      label: 'Gelo',
      emoji: '🧊',
      produtos: gelo,
      required: false,
      max: 10,
      selecao: {},
    });
  }

  return grupos;
}

function calcCustomTotal() {
  if (!customDraft) return 0;
  let total = 0;
  for (const g of customDraft.grupos) {
    for (const [pid, qty] of Object.entries(g.selecao)) {
      const p = productById(pid);
      if (p) total += p.preco_venda * qty;
    }
  }
  if (customDraft.tamanho) total += customDraft.tamanho.precoExtra;
  return total;
}

function renderCustomCombo() {
  if (!customDraft) return;

  const container = document.getElementById('combo-custom-grupos');
  if (!container) return;

  let html = '';

  // ── Grupos de produtos (Copões, Energéticos, Gelo) ──
  for (const g of customDraft.grupos) {
    const totalSel = Object.values(g.selecao).reduce((s, q) => s + q, 0);
    const ok = !g.required || totalSel > 0;

    html += `
    <div class="combo-grupo-section" data-grupo="${g.id}">
      <div class="combo-custom-grupo-header">
        <span>${g.emoji} ${g.label.toUpperCase()}</span>
        <span class="combo-custom-contador ${totalSel > 0 ? 'ok' : ''}">${totalSel} sel.</span>
      </div>`;

    if (!g.produtos.length) {
      html += `<div style="padding:10px 12px;font-size:12px;color:var(--text2);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-sm) var(--radius-sm);background:var(--bg3)">
        Nenhum produto cadastrado nesta categoria. Cadastre em <strong>Produtos</strong>.
      </div>`;
    } else {
      html += g.produtos.map(p => {
        const qty    = g.selecao[p.id] || 0;
        const semEst = p.estoque <= 0;
        const imgUrl = p.fotos_urls?.[0] || p.foto_url || '';
        return `
        <div class="combo-opcao-item ${semEst ? 'opcao-sem-estoque' : ''}">
          <div class="combo-opcao-foto">
            ${imgUrl
              ? `<img src="${esc(imgUrl)}" alt="${esc(p.nome)}"
                   onerror="this.parentElement.innerHTML='<span>${categoryEmoji(p.categoria)}</span>'" />`
              : `<span>${categoryEmoji(p.categoria)}</span>`}
          </div>
          <div class="combo-opcao-nome-bloco">
            <span class="combo-opcao-nome-txt">${esc(p.nome)}</span>
            <span style="font-size:10px;color:var(--text2)">${fmt(p.preco_venda)}/un${semEst ? ' · <span style="color:var(--red)">Sem estoque</span>' : ''}</span>
          </div>
          <div class="combo-opcao-ctrl">
            <button class="combo-ctrl-btn" type="button"
              data-custom-grupo="${g.id}" data-custom-pid="${p.id}" data-custom-step="1"
              ${semEst ? 'disabled' : ''}>+</button>
            <span class="combo-ctrl-qty">${qty}</span>
            <button class="combo-ctrl-btn combo-ctrl-minus" type="button"
              data-custom-grupo="${g.id}" data-custom-pid="${p.id}" data-custom-step="-1"
              ${qty <= 0 ? 'disabled' : ''}>−</button>
          </div>
        </div>`;
      }).join('');
    }

    html += `</div>`; // /combo-grupo-section
  }

  // ── Grupo Tamanho do Copo ──
  const tamSel = customDraft.tamanho?.label || '';
  html += `
  <div class="combo-grupo-section">
    <div class="combo-custom-grupo-header">
      <span>🥤 TAMANHO DO COPO</span>
      <span class="combo-custom-contador ${tamSel ? 'ok' : ''}">${tamSel || 'nenhum'}</span>
    </div>
    <div class="combo-custom-tamanhos">
      ${TAMANHOS_COPO.map(t => `
        <button type="button"
          class="combo-custom-tamanho-btn ${tamSel === t.label ? 'selecionado' : ''}"
          data-custom-tamanho="${esc(t.label)}"
          data-custom-preco-extra="${t.precoExtra}">
          ${esc(t.label)}${t.precoExtra > 0 ? ` <small style="opacity:.7">+${fmt(t.precoExtra)}</small>` : ''}
        </button>`).join('')}
    </div>
  </div>`;

  container.innerHTML = html;

  // Atualiza total e botão
  const total    = calcCustomTotal();
  const precoEl  = document.getElementById('combo-custom-preco-total');
  const ajudaEl  = document.getElementById('combo-custom-ajuda');
  const btnOk    = document.getElementById('btn-confirmar-combo-custom');

  if (precoEl) precoEl.textContent = fmt(total);

  const totalItens = customDraft.grupos.reduce((s, g) =>
    s + Object.values(g.selecao).reduce((a, b) => a + b, 0), 0);

  const temAlgo = totalItens > 0 || !!customDraft.tamanho;

  if (ajudaEl) {
    ajudaEl.textContent = temAlgo
      ? `${totalItens} item${totalItens !== 1 ? 's' : ''}${customDraft.tamanho ? ' · ' + customDraft.tamanho.label : ''} · Adicionar`
      : 'Selecione os itens';
  }

  if (btnOk) btnOk.disabled = !temAlgo;
}

function abrirComboCustom() {
  customDraft = {
    grupos:  buildCustomGrupos(),
    tamanho: null,
  };
  document.getElementById('combo-custom-preco-total').textContent = 'R$ 0,00';
  document.getElementById('modal-combo-custom')?.classList.remove('hidden');
  renderCustomCombo();
}

// Botão fixo que abre o modal
document.getElementById('btn-montar-combo-custom')?.addEventListener('click', abrirComboCustom);

// Eventos dentro do modal (+ / − de produtos e seleção de tamanho)
document.getElementById('combo-custom-grupos')?.addEventListener('click', e => {
  if (!customDraft) return;

  // Controles de quantidade por grupo
  const btnQty = e.target.closest('[data-custom-grupo]');
  if (btnQty) {
    const grupoId = btnQty.dataset.customGrupo;
    const pid     = btnQty.dataset.customPid;
    const delta   = +btnQty.dataset.customStep;
    const g       = customDraft.grupos.find(x => x.id === grupoId);
    if (!g) return;

    const atual      = g.selecao[pid] || 0;
    const totalGrupo = Object.values(g.selecao).reduce((s, q) => s + q, 0);

    if (atual + delta < 0) return;
    if (delta > 0 && totalGrupo >= g.max) {
      showToast(`Máximo de ${g.max} itens por grupo atingido.`, 'info');
      return;
    }
    if (delta > 0) {
      const prod = productById(pid);
      if (prod && prod.estoque <= 0) return;
    }

    g.selecao[pid] = atual + delta;
    if (g.selecao[pid] === 0) delete g.selecao[pid];
    renderCustomCombo();
    return;
  }

  // Botões de tamanho
  const btnTam = e.target.closest('[data-custom-tamanho]');
  if (btnTam) {
    const label      = btnTam.dataset.customTamanho;
    const precoExtra = parseFloat(btnTam.dataset.customPrecoExtra) || 0;
    // Toggle — clicar no mesmo desmarca
    if (customDraft.tamanho?.label === label) {
      customDraft.tamanho = null;
    } else {
      customDraft.tamanho = { label, precoExtra };
    }
    renderCustomCombo();
  }
});

// Confirmar combo personalizado → adiciona itens individualmente ao carrinho
document.getElementById('btn-confirmar-combo-custom')?.addEventListener('click', () => {
  if (!customDraft) return;

  let adicionados = 0;

  for (const g of customDraft.grupos) {
    for (const [pid, qty] of Object.entries(g.selecao)) {
      if (qty <= 0) continue;
      const p = productById(pid);
      if (!p) continue;

      // Se já existe no carrinho (avulso), incrementa
      const existente = cart.find(x => !x.components.length && x.product_id === pid);
      if (existente) {
        existente.quantity += qty;
      } else {
        cart.push({
          key:        crypto.randomUUID(),
          product_id: pid,
          quantity:   qty,
          components: [],
          // Guarda o tamanho como observação no item (exibição)
          tamanho:    customDraft.tamanho?.label || null,
        });
      }
      adicionados++;
    }
  }

  // Tamanho sem produto — adiciona como nota visual (não há SKU de tamanho)
  // O tamanho fica registrado nos itens acima; se só tamanho foi selecionado, ignora.

  document.getElementById('modal-combo-custom')?.classList.add('hidden');
  customDraft = null;

  if (adicionados > 0) {
    renderCart();
    showToast('✅ Itens adicionados ao carrinho!', 'success');
  } else {
    showToast('Selecione ao menos um produto.', 'info');
  }
});

// ============================================================
// AUTENTICAÇÃO E INICIALIZAÇÃO
// ============================================================
async function initSession() {
  const authUser = document.getElementById('auth-user');
  const logoutBtn= document.getElementById('auth-logout');

  try {
    const { data: { session } = { session: null } } = await client.auth.getSession();
    if (session?.user) {
      if (authUser)  authUser.textContent  = session.user.email;
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    }
  } catch (err) {
    console.warn('Sem sessão ativa, operando sem login:', err);
  }

  await loadCategorias();
  await loadProducts();
  await Promise.all([
    loadUltimasVendas(),
    loadProdutosList(),
    loadUltimasEntradas(),
    loadResumoEntradas(),
    loadDashboard(),
  ]);
  setupRealtime();
  renderCart();
}

document.getElementById('auth-logout')?.addEventListener('click', async () => {
  await client.auth.signOut();
  cart    = [];
  payment = '';
  renderCart();
  location.reload();
});

window.addEventListener('load', () => initSession());
