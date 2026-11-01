// ============================================================
// ADEGA CORUJÃO — CARDÁPIO PÚBLICO
// Lê apenas os dados necessários via API REST do Supabase (fetch).
// Não registra venda, não baixa estoque, não expõe custo.
// ============================================================

const SUPABASE_URL = 'https://fykqqioozgotmmebtlix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';
const REST     = SUPABASE_URL + '/rest/v1/';
const REST_HDR = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

// Colunas necessárias — não busca created_at nem campos internos
const PROD_COLS = 'id,nome,categoria,preco_venda,estoque,status,foto_url,fotos_urls,descricao_publica,tamanho,combo_config,visivel_publico';

async function apiGet(table, query) {
  const res = await fetch(REST + table + (query ? '?' + query : ''), {
    headers: REST_HDR,
    // 'default' usa cache do browser + ETag; se o servidor retornar 304
    // o browser entrega a resposta em cache instantaneamente
    cache: 'default',
  });
  if (!res.ok) throw new Error(table + ' HTTP ' + res.status);
  return res.json();
}

// ── ESTADO ────────────────────────────────────────────────
let allProducts    = [];   // todos os ativos (menu_publico) — inclui componentes
let publicProducts = [];   // visivel_publico = true → vão ao cardápio
let categories     = [];
let copaoTamanhos  = [];
let copaoSabores   = [];
let lojaConfig     = {};
let cart           = [];

let selectedCategory = '';
let searchQuery      = '';

// ── UTIL ──────────────────────────────────────────────────
const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => Number(v || 0);

const byId       = id => allProducts.find(p => p.id === id);
const isCombo    = p  => !!(p?.combo_config?.groups?.length);
const isCopao    = p  => !!(p && typeof p.categoria === 'string'
                          && p.categoria.toLowerCase().startsWith('cop'));
const primaryImg = p  => p?.fotos_urls?.[0] || p?.foto_url || '';
const catEmoji   = n  => categories.find(c => c.nome === n)?.emoji || '🍶';

// Gradientes por categoria (mesmo clima das imagens)
const CAT_GRADIENTS = {
  'Copões de Gin e Vodka': 'linear-gradient(135deg, rgba(219,39,119,.55) 0%, rgba(147,51,234,.3) 60%, transparent 100%)',
  'Copões de Whisky':      'linear-gradient(135deg, rgba(180,83,9,.55) 0%, rgba(147,51,234,.3) 60%, transparent 100%)',
  'Copões Gourmet':        'linear-gradient(135deg, rgba(79,70,229,.55) 0%, rgba(147,51,234,.3) 60%, transparent 100%)',
  'Copões':                'linear-gradient(135deg, rgba(147,51,234,.55) 0%, rgba(109,40,217,.3) 60%, transparent 100%)',
  'Combos':                'linear-gradient(135deg, rgba(6,95,70,.5) 0%, rgba(147,51,234,.3) 60%, transparent 100%)',
  'Cervejas':              'linear-gradient(135deg, rgba(161,98,7,.5) 0%, rgba(147,51,234,.2) 60%, transparent 100%)',
  'Garrafas':              'linear-gradient(135deg, rgba(109,40,217,.5) 0%, rgba(30,27,75,.6) 60%, transparent 100%)',
  'Refrigerantes':         'linear-gradient(135deg, rgba(29,78,216,.45) 0%, rgba(147,51,234,.2) 60%, transparent 100%)',
  'Energéticos':           'linear-gradient(135deg, rgba(21,128,61,.45) 0%, rgba(147,51,234,.2) 60%, transparent 100%)',
  'Destilados':            'linear-gradient(135deg, rgba(120,53,15,.5) 0%, rgba(147,51,234,.3) 60%, transparent 100%)',
  'Gourmet':               'linear-gradient(135deg, rgba(88,28,135,.55) 0%, rgba(219,39,119,.25) 60%, transparent 100%)',
};
const defaultGrad = 'linear-gradient(135deg, rgba(109,40,217,.45) 0%, transparent 70%)';

// Tags de destaque por nome de produto (enriquecem visualmente o card)
const SABORES_DESTAQUE = {
  'Tanqueray':   ['Limão','Maracujá','Morango'],
  'Beefeater':   ['Rosa','Limão'],
  'Absolut':     ['Frutas Vermelhas','Limão'],
  'Frozen':      ['Maracujá','Limão','Morango'],
  'Tomo Chapo':  ['Maracujá','Morango','Uva Verde'],
};

// ── TOAST ─────────────────────────────────────────────────
let _toastT = null;
function showToast(msg, tipo = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + tipo;
  if (_toastT) clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ============================================================
// CARREGAR DADOS
// ============================================================
// ============================================================
// CACHE LOCAL (localStorage)
// ============================================================
const CACHE_KEY = 'corujao_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function salvarCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) { /* quota cheia — ignora */ }
}

function lerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null; // expirado
    return data;
  } catch (_) { return null; }
}

// ============================================================
// CARREGAR DADOS
// ============================================================
let primeiraCarga = true;
let dataSig       = '';
let carregando    = false; // evita fetch duplo

function signature() {
  return allProducts.map(x =>
    [x.id, x.preco_venda, x.estoque, x.visivel_publico ? 1 : 0,
     x.descricao_publica || '', x.tamanho || ''].join(':')
  ).sort().join('|') + '#' + categories.length + '#' +
  copaoTamanhos.length + '#' + (lojaConfig.whatsapp || '');
}

function refreshCartPrices() {
  cart.forEach(item => {
    if (item.is_custom_copao) {
      item.componentes.forEach(c => { const p = byId(c.product_id); if (p) c.preco = num(p.preco_venda); });
    } else if (item.product_id) {
      const p = byId(item.product_id);
      if (p) item.preco_base = num(p.preco_venda);
      item.adicionais.forEach(a => { const ap = byId(a.product_id); if (ap) a.preco = num(ap.preco_venda); });
    }
  });
}

function aplicarDados(dados) {
  categories    = dados.cats  || [];
  allProducts   = dados.prods || [];
  publicProducts = allProducts.filter(p => p.visivel_publico);
  copaoTamanhos = dados.tams  || [];
  copaoSabores  = dados.sab   || [];
  lojaConfig    = Object.fromEntries((dados.cfg || []).map(r => [r.chave, r.valor]));
}

function renderizarTudo() {
  refreshCartPrices();
  renderCart();

  if (!publicProducts.length) {
    showEstado(true, 'empty');
    renderChips();
    renderLojaInfo();
    return;
  }

  const sig = signature();
  if (sig === dataSig) return; // nada mudou — não re-renderiza
  dataSig = sig;

  showEstado(false);
  applyIdentity();
  renderChips();
  renderCardapio();
  renderLojaInfo();
}

async function loadAll() {
  if (carregando) return;
  carregando = true;

  // ── 1. Renderiza do cache imediatamente (sem esperar a rede) ──
  if (primeiraCarga) {
    const cache = lerCache();
    if (cache) {
      aplicarDados(cache);
      primeiraCarga = false;
      renderizarTudo(); // aparece instantaneamente
    } else {
      showEstado(true, 'loading'); // só mostra loading na 1ª visita sem cache
    }
  }

  // ── 2. Busca dados frescos da rede em background ──
  try {
    const [cats, prods, tams, sab, cfg] = await Promise.all([
      apiGet('categorias', 'select=id,nome,emoji,ordem,ativo&ativo=eq.true&order=ordem.asc,nome.asc'),
      apiGet('menu_publico', `select=${PROD_COLS}&order=nome.asc`),
      apiGet('copao_tamanhos', 'select=id,label,preco_extra,ordem,ativo&ativo=eq.true&order=ordem.asc'),
      apiGet('copao_sabores',  'select=id,nome,categoria_copao,preco_extra,ordem,ativo&ativo=eq.true&order=ordem.asc'),
      apiGet('loja_config',    'select=chave,valor'),
    ]);

    const dados = { cats, prods, tams, sab, cfg };
    aplicarDados(dados);
    salvarCache(dados); // persiste para a próxima visita
    primeiraCarga = false;
    renderizarTudo();
  } catch (err) {
    console.error('Erro ao carregar:', err);
    primeiraCarga = false;
    // só mostra erro se não tinha cache
    if (!publicProducts.length) showEstado(true, 'error');
  } finally {
    carregando = false;
  }
}

// ── IDENTITY ──────────────────────────────────────────────
function applyIdentity() {
  const nome  = lojaConfig.nome_loja        || 'Corujão';
  const frase = lojaConfig.frase_identidade || 'A noite tem dono';
  document.title = nome + ' — Cardápio';
  const b = document.getElementById('hero-brand');   if (b) b.textContent = nome;
  const t = document.getElementById('hero-tagline'); if (t) t.textContent = frase;
}

// ── ESTADO ────────────────────────────────────────────────
function showEstado(show, kind) {
  const wrap = document.getElementById('estado-cardapio');
  const cont = document.getElementById('cardapio-container');
  if (!wrap) return;
  wrap.hidden = !show;
  if (cont) cont.hidden = show;
  if (!show) return;
  const b = document.getElementById('estado-box');
  const map = {
    loading: `<div class="spinner"></div><div class="estado-titulo">Carregando…</div><div class="estado-texto">Buscando as bebidas geladinhas 🦉</div>`,
    error:   `<div class="estado-emoji">📡</div><div class="estado-titulo">Cardápio indisponível</div><div class="estado-texto">Não foi possível carregar o cardápio agora. Verifique sua conexão.</div>`,
    empty:   `<div class="estado-emoji">🦉</div><div class="estado-titulo">Em breve</div><div class="estado-texto">A adega ainda não liberou os produtos para o cardápio online.</div>`,
  };
  if (b) b.innerHTML = map[kind] || '';
}

// ── CHIPS DE CATEGORIA ────────────────────────────────────
function renderChips() {
  const bar = document.getElementById('category-chips');
  if (!bar) return;

  // categorias que têm ao menos 1 produto visível
  const comProd = categories.filter(c => publicProducts.some(p => p.categoria === c.nome));
  if (selectedCategory && !publicProducts.some(p => p.categoria === selectedCategory)) {
    selectedCategory = '';
  }

  bar.innerHTML =
    `<button class="chip ${!selectedCategory ? 'active' : ''}" data-category="" role="tab">Todos</button>` +
    comProd.map(c =>
      `<button class="chip ${selectedCategory === c.nome ? 'active' : ''}" data-category="${esc(c.nome)}" role="tab">${esc(c.emoji)} ${esc(c.nome)}</button>`
    ).join('');

  bar.querySelectorAll('.chip').forEach(btn =>
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.category;
      renderChips();
      renderCardapio();
      // scroll suave até a seção se navegando por chip
      if (selectedCategory) {
        const sec = document.getElementById('sec-' + CSS.escape(selectedCategory));
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    })
  );
}

// ── CARDÁPIO PRINCIPAL ────────────────────────────────────
function renderCardapio() {
  const cont = document.getElementById('cardapio-container');
  if (!cont) return;

  let lista = publicProducts.slice();
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    lista = lista.filter(p =>
      (p.nome || '').toLowerCase().includes(q) ||
      (p.descricao_publica || '').toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q)
    );
  }
  if (selectedCategory) {
    lista = lista.filter(p => p.categoria === selectedCategory);
  }

  if (!lista.length) {
    cont.innerHTML = `<div class="estado-cardapio"><div class="estado-box"><div class="estado-emoji">🔍</div><div class="estado-titulo">Nenhum resultado</div><div class="estado-texto">Tente outro nome ou categoria.</div></div></div>`;
    cont.hidden = false;
    return;
  }

  const catOrder = categories.map(c => c.nome);
  const grupos   = new Map();
  lista.forEach(p => {
    const cat = p.categoria || 'Outros';
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(p);
  });

  const gruposOrdenados = [...grupos.entries()].sort(([a], [b]) => {
    const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const temCopao   = allProducts.some(p => isCopao(p) && p.estoque > 0);
  const showBanner = temCopao && copaoTamanhos.length > 0 && !selectedCategory;

  // Limpa e coloca o banner primeiro (é pequeno, aparece rápido)
  cont.innerHTML = '';
  cont.hidden = false;
  if (showBanner) {
    const bannerEl = document.createElement('div');
    bannerEl.innerHTML = buildCopаoBanner();
    const b = bannerEl.firstElementChild;
    cont.appendChild(b);
    b.querySelectorAll('[data-copao-banner]').forEach(btn =>
      btn.addEventListener('click', openCustomCopao)
    );
  }

  // Renderiza cada categoria numa animationFrame separado
  // → o browser pinta o banner imediatamente, depois adiciona
  //   uma categoria por frame sem travar o scroll/toque
  let i = 0;
  function renderProximo() {
    if (i >= gruposOrdenados.length) return;
    const [cat, itens] = gruposOrdenados[i++];
    itens.sort((a, b) =>
      (isCombo(b) ? 1 : 0) - (isCombo(a) ? 1 : 0) ||
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
    );
    const secEl = document.createElement('section');
    secEl.className = 'cat-section';
    secEl.id = 'sec-' + cat.replace(/\s+/g, '-').toLowerCase();
    secEl.dataset.cat = cat;
    secEl.innerHTML = buildSectionInner(cat, itens);
    cont.appendChild(secEl);

    // eventos dos botões desta seção
    secEl.querySelectorAll('[data-open]').forEach(btn =>
      btn.addEventListener('click', () => { const p = byId(btn.dataset.open); if (p) openProduct(p); })
    );

    requestAnimationFrame(renderProximo);
  }
  requestAnimationFrame(renderProximo);
}

// ── BUILD: BANNER MONTE SEU COPÃO ────────────────────────
function buildCopаoBanner() {
  return `
  <div class="copao-banner" data-copao-banner="1" role="button" tabindex="0"
       aria-label="Monte seu Copão personalizado">
    <div class="copao-banner-left">
      <span class="copao-banner-emoji">🎯</span>
      <div>
        <div class="copao-banner-title">Monte seu Copão</div>
        <div class="copao-banner-sub">Escolha copão · energético · gelo · tamanho</div>
      </div>
    </div>
    <button type="button" class="copao-banner-btn" data-copao-banner="1">Montar</button>
  </div>`;
}

// ── BUILD: SEÇÃO DE CATEGORIA ─────────────────────────────
function buildSectionInner(cat, itens) {
  const grad = CAT_GRADIENTS[cat] || defaultGrad;
  const emoji = catEmoji(cat);

  const SUBS = {
    'Copões de Gin e Vodka': 'Sabores que marcam momentos · 700ml',
    'Copões de Whisky':      'Bebe · Vive · Repete · 700ml',
    'Copões Gourmet':        'Aqui cada gole conta uma história · 700ml',
    'Copões':                '700ml de puro respeito',
    'Combos':                'Mais que bebida, é liberdade',
    'Cervejas':              'Gelada na hora certa',
    'Garrafas':              'Para uma noite inesquecível',
    'Refrigerantes':         'Para acompanhar bem',
    'Energéticos':           'Energia para a noite toda',
    'Destilados':            'Puro e de verdade',
    'Gourmet':               'Experiência premium',
  };
  const sub = SUBS[cat] || '';
  const showBadge = ['Copões de Gin e Vodka','Copões de Whisky','Copões Gourmet','Copões','Gourmet'].includes(cat);

  const header = `
  <div class="cat-header" style="--cat-gradient:${grad}">
    <div class="cat-header-info">
      <div class="cat-eyebrow">${esc(emoji)} Nosso cardápio</div>
      <div class="cat-title">${esc(cat)}</div>
      ${sub ? `<div class="cat-sub">${esc(sub)}</div>` : ''}
    </div>
    ${showBadge ? `
    <div class="cat-badge">
      <span class="cat-badge-vol">700ml</span>
      <span class="cat-badge-desc">De puro respeito</span>
    </div>` : ''}
  </div>`;

  const cards = itens.map((p, i) => buildCard(p, i + 1)).join('');

  let adicional = '';
  if (cat.toLowerCase().includes('cop') || cat.toLowerCase().includes('gourmet')) {
    const energeticos = allProducts.filter(x => x.categoria === 'Energéticos' && x.estoque > 0);
    if (energeticos.length) {
      const nomes = [...new Set(energeticos.map(e => e.nome.replace(/energético\s*/i,'').trim()))].slice(0, 2).join(' ou ');
      const preco = energeticos[0].preco_venda;
      adicional = `
      <div class="cat-adicional">
        ⚡ <span>Adicione <strong>${nomes.length > 2 ? nomes : 'Red Bull ou Monster'}</strong> por apenas <strong>+ ${fmt(preco)}</strong></span>
      </div>`;
    }
  }

  return `${header}<div class="cat-items">${cards}</div>${adicional}`;
}

// ── BUILD: CARD DE PRODUTO ────────────────────────────────
function buildCard(p, num_) {
  const combo       = isCombo(p);
  const esgotado    = !combo && p.estoque <= 0;
  const foto        = primaryImg(p);
  const emoji       = catEmoji(p.categoria);

  // tags de sabor (do banco via descricao_publica, ou fallback de destaque)
  let tags = '';
  const nome_upper = (p.nome || '').toUpperCase();
  const key = Object.keys(SABORES_DESTAQUE).find(k => nome_upper.includes(k.toUpperCase()));
  if (key) {
    tags = SABORES_DESTAQUE[key]
      .map(s => `<span class="item-tag">${esc(s)}</span>`)
      .join('');
  }

  const fotoHtml = foto
    ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" loading="lazy" decoding="async"
           onerror="this.parentElement.innerHTML='<span class=fb>${emoji}</span>'" />`
    : `<span class="fb">${emoji}</span>`;

  const precoFmt = fmt(p.preco_venda);
  // separa "R$" do número para estilizar diferente
  const [rs, val] = precoFmt.split(/\s(.+)/);

  const btnLabel = esgotado ? 'Esgotado' : (combo ? 'Montar' : 'Pedir');
  const btnClass = combo ? 'item-btn combo-btn' : 'item-btn';

  return `
  <div class="item-card ${esgotado ? 'esgotado' : ''}" role="article">
    <span class="item-num">${String(num_).padStart(2, '0')}</span>
    <div class="item-foto">${fotoHtml}</div>
    <div class="item-info">
      <div class="item-nome">${esc(p.nome)}</div>
      ${p.descricao_publica ? `<div class="item-desc">${esc(p.descricao_publica)}</div>` : ''}
      ${tags ? `<div class="item-tags">${tags}</div>` : ''}
      ${p.tamanho ? `<div class="item-desc">🥤 ${esc(p.tamanho)}</div>` : ''}
    </div>
    <div class="item-action">
      <div class="item-preco"><span class="rs">${esc(rs)} </span>${esc(val || '')}</div>
      <button type="button" class="${btnClass}"
        data-open="${esc(p.id)}" ${esgotado ? 'disabled' : ''}>${btnLabel}</button>
      ${esgotado ? '<span class="item-badge-esgotado">Esgotado</span>' : ''}
    </div>
  </div>`;
}

// ── BUSCA (debounce) ──────────────────────────────────────
function setupSearch() {
  const inp = document.getElementById('busca-produto');
  if (!inp) return;
  let t = null;
  inp.addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderChips();
      renderCardapio();
    }, 180);
  });
}

// ============================================================
// MODAL PRODUTO
// ============================================================
let produtoDraft = null;

function openProduct(p) {
  if (isCombo(p)) return openCombo(p);
  produtoDraft = {
    product: p, quantidade: 1,
    sabores: [], adicionais: [], observacao: '',
  };
  renderProductModal();
  document.getElementById('modal-produto').classList.remove('hidden');
}

function renderProductModal() {
  const p      = produtoDraft.product;
  const foto   = primaryImg(p);
  const emoji  = catEmoji(p.categoria);
  const copao  = isCopao(p);
  const indisp = !isCombo(p) && p.estoque <= 0;

  const sabores   = copao ? copaoSabores.filter(s => !s.categoria_copao || s.categoria_copao === p.categoria) : [];
  const adicionais = copao ? allProducts.filter(x => x.categoria === 'Energéticos' || x.categoria === 'Gelo') : [];

  const fotoHtml = foto
    ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" decoding="async"
           onerror="this.parentElement.innerHTML='<span class=fb>${emoji}</span>'" />`
    : `<span class="fb">${emoji}</span>`;

  document.getElementById('produto-modal-content').innerHTML = `
    <div class="produto-modal-foto">${fotoHtml}</div>
    <div class="produto-modal-body">
      <div class="pm-categoria">${esc(emoji)} ${esc(p.categoria)}</div>
      <div class="pm-nome">${esc(p.nome)}</div>
      ${p.descricao_publica ? `<div class="pm-desc">${esc(p.descricao_publica)}</div>` : ''}
      <div class="pm-meta">
        ${p.tamanho ? `<span class="pm-tamanho">🥤 ${esc(p.tamanho)}</span>` : ''}
        <span class="pm-preco">${fmt(calcUnit())}</span>
      </div>
      ${indisp ? '<p class="pm-indisponivel">Produto esgotado no momento.</p>' : ''}

      ${copao && sabores.length ? `
      <div class="pm-section">
        <div class="pm-section-title">Sabores <span class="opt">opcional</span></div>
        <div class="sabores-wrap" id="sabores-wrap">
          ${sabores.map(s => `
          <button type="button" class="sabor-chip${produtoDraft.sabores.some(x=>x.id===s.id)?' selected':''}"
            data-sabor="${esc(s.id)}" data-nome="${esc(s.nome)}" data-preco="${num(s.preco_extra)}">
            ${esc(s.nome)}${num(s.preco_extra)?`<span class="preco">+${fmt(s.preco_extra)}</span>`:''}
          </button>`).join('')}
        </div>
      </div>` : ''}

      ${copao && adicionais.length ? `
      <div class="pm-section">
        <div class="pm-section-title">Adicionais <span class="opt">opcional</span></div>
        ${adicionais.map(a => {
          const sem = a.estoque <= 0;
          const sel = produtoDraft.adicionais.some(x=>x.product_id===a.id);
          return `
          <div class="adicional-item">
            <div class="adicional-info">
              <div class="adicional-nome">${esc(a.nome)}</div>
              <div class="adicional-preco">${fmt(a.preco_venda)}${sem?' · sem estoque':''}</div>
            </div>
            <button type="button" class="adicional-add${sel?' selected':''}"
              data-adicional="${esc(a.id)}" data-nome="${esc(a.nome)}" data-preco="${num(a.preco_venda)}"
              ${sem?'disabled':''}>${sel?'✓':'+'}</button>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="pm-section">
        <div class="pm-section-title">Quantidade</div>
        <div class="quantidade-wrap">
          <span class="qlabel">Itens</span>
          <div class="quantidade-ctrl">
            <button type="button" id="qty-minus">−</button>
            <span id="qty-val">${produtoDraft.quantidade}</span>
            <button type="button" id="qty-plus">+</button>
          </div>
        </div>
      </div>

      <div class="pm-section">
        <div class="pm-section-title">Observação <span class="opt">opcional</span></div>
        <textarea class="pm-obs" id="pm-obs" placeholder="Ex: capricha no gelo, sem açúcar…">${esc(produtoDraft.observacao)}</textarea>
      </div>

      <div class="pm-botoes">
        <button type="button" class="btn-whats" id="pm-whats" ${indisp?'disabled':''}>Pedir pelo WhatsApp</button>
        <button type="button" class="btn-primary btn-large" id="pm-add" ${indisp?'disabled':''}>Adicionar ao pedido</button>
      </div>
    </div>`;

  bindProductModal();
}

function calcUnit() {
  const p = produtoDraft.product;
  return num(p.preco_venda)
    + produtoDraft.sabores.reduce((s,x) => s+num(x.preco_extra), 0)
    + produtoDraft.adicionais.reduce((s,x) => s+num(x.preco), 0);
}

function bindProductModal() {
  document.getElementById('qty-minus')?.addEventListener('click', () => {
    produtoDraft.quantidade = Math.max(1, produtoDraft.quantidade - 1);
    document.getElementById('qty-val').textContent = produtoDraft.quantidade;
  });
  document.getElementById('qty-plus')?.addEventListener('click', () => {
    produtoDraft.quantidade++;
    document.getElementById('qty-val').textContent = produtoDraft.quantidade;
  });
  document.querySelectorAll('#sabores-wrap .sabor-chip').forEach(btn =>
    btn.addEventListener('click', () => {
      const { sabor: id, nome, preco } = btn.dataset;
      const idx = produtoDraft.sabores.findIndex(s => s.id === id);
      if (idx >= 0) { produtoDraft.sabores.splice(idx,1); btn.classList.remove('selected'); }
      else { produtoDraft.sabores.push({id, nome, preco_extra:num(preco)}); btn.classList.add('selected'); }
      document.querySelector('.pm-preco').textContent = fmt(calcUnit());
    })
  );
  document.querySelectorAll('[data-adicional]').forEach(btn =>
    btn.addEventListener('click', () => {
      const { adicional:id, nome, preco } = btn.dataset;
      const idx = produtoDraft.adicionais.findIndex(x=>x.product_id===id);
      if (idx >= 0) { produtoDraft.adicionais.splice(idx,1); btn.classList.remove('selected'); btn.textContent='+'; }
      else { produtoDraft.adicionais.push({product_id:id,nome,preco:num(preco)}); btn.classList.add('selected'); btn.textContent='✓'; }
      document.querySelector('.pm-preco').textContent = fmt(calcUnit());
    })
  );
  document.getElementById('pm-obs')?.addEventListener('input', e => { produtoDraft.observacao = e.target.value; });
  document.getElementById('pm-add')?.addEventListener('click', () => {
    cartUpsert(draftToItem());
    renderCart();
    closeModal('modal-produto');
    showToast('Adicionado ao pedido ✓', 'ok');
  });
  document.getElementById('pm-whats')?.addEventListener('click', () => {
    const item = draftToItem();
    closeModal('modal-produto');
    enviarPedido([item]);
  });
}

function draftToItem() {
  const p = produtoDraft.product;
  return {
    kind: isCombo(p)?'combo':(isCopao(p)?'copao':'simples'),
    product_id: p.id, nome: p.nome, categoria: p.categoria,
    tamanho: p.tamanho||null, foto_url: primaryImg(p),
    preco_base: num(p.preco_venda), preco_unit: calcUnit(),
    quantidade: produtoDraft.quantidade,
    sabores: [...produtoDraft.sabores], adicionais: [...produtoDraft.adicionais],
    componentes: [], copo_tamanho: null,
    observacao: produtoDraft.observacao.trim(), is_custom_copao: false,
  };
}

// ============================================================
// MODAL COMBO (combo_config)
// ============================================================
let comboDraft = null;

function openCombo(p) {
  comboDraft = { product: p, selection: {}, observacao: '' };
  document.getElementById('combo-nome').textContent  = p.nome;
  document.getElementById('combo-preco').textContent = fmt(p.preco_venda);
  const img = document.getElementById('combo-img');
  const f = primaryImg(p);
  img.innerHTML = f
    ? `<img src="${esc(f)}" alt="${esc(p.nome)}" onerror="this.parentElement.innerHTML='<span style=font-size:32px>${catEmoji(p.categoria)}</span>'" />`
    : `<span style="font-size:32px">${catEmoji(p.categoria)}</span>`;
  renderComboDraft();
  document.getElementById('modal-combo').classList.remove('hidden');
}

function renderComboDraft() {
  const p    = comboDraft.product;
  const cont = document.getElementById('combo-grupos');

  cont.innerHTML = p.combo_config.groups.map(g => {
    const chosen = g.options.reduce((s,id) => s+(comboDraft.selection[id]||0), 0);
    const req    = g.required !== false;
    const minEff = req ? Math.max(g.min||0, 1) : (g.min||0);
    const maxEff = (g.max||0) >= 999 ? Infinity : (g.max||0);
    const ok     = chosen >= minEff && (maxEff===Infinity||chosen<=maxEff);
    const maxLbl = maxEff===Infinity ? '∞' : (g.max||0);
    return `
    <div class="combo-grupo">
      <div class="combo-grupo-head">
        <span class="combo-grupo-nome">${esc(g.name).toUpperCase()}</span>
        <span class="combo-grupo-contador ${ok?'ok':''}">${chosen} de ${maxLbl}</span>
      </div>
      <div class="combo-grupo-hint">${req?'Obrigatório':'Opcional'} · mín. ${minEff}</div>
      ${g.options.map(id => {
        const op  = byId(id);
        const qty = comboDraft.selection[id] || 0;
        const sem = op && op.estoque <= 0;
        const pf  = op ? primaryImg(op) : '';
        return `
        <div class="combo-opcao ${sem?'sem-estoque':''}">
          <div class="combo-opcao-foto">
            ${pf
              ? `<img src="${esc(pf)}" alt="${esc(op?.nome||'')}" onerror="this.parentElement.innerHTML='<span class=fb>${op?catEmoji(op.categoria):'📦'}</span>'" />`
              : `<span class="fb">${op?catEmoji(op.categoria):'📦'}</span>`}
          </div>
          <div class="combo-opcao-info">
            <span class="combo-opcao-nome">${esc(op?.nome||'Indisponível')}</span>
            ${sem?'<span class="combo-opcao-extra sem">sem estoque</span>':''}
          </div>
          <div class="combo-opcao-ctrl">
            <button class="combo-ctrl-btn" type="button" data-choice="${esc(id)}" data-step="-1" ${qty<=0||sem?'disabled':''}>−</button>
            <span class="combo-ctrl-qty">${qty}</span>
            <button class="combo-ctrl-btn" type="button" data-choice="${esc(id)}" data-step="1" ${sem?'disabled':''}>+</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('') + `
  <div class="combo-grupo">
    <div class="pm-section-title" style="margin-top:0">Observação <span class="opt">opcional</span></div>
    <textarea class="pm-obs" id="combo-obs" placeholder="Ex: sem gelo…">${esc(comboDraft.observacao)}</textarea>
  </div>`;

  cont.querySelectorAll('[data-choice]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id   = btn.dataset.choice;
      const step = parseInt(btn.dataset.step, 10);
      comboDraft.selection[id] = Math.max(0, (comboDraft.selection[id]||0)+step);
      renderComboDraft();
    })
  );
  document.getElementById('combo-obs')?.addEventListener('input', e => { comboDraft.observacao = e.target.value; });

  const invalidos = p.combo_config.groups.filter(g => {
    const chosen = g.options.reduce((s,id)=>s+(comboDraft.selection[id]||0),0);
    const req=g.required!==false, minEff=req?Math.max(g.min||0,1):(g.min||0), maxEff=(g.max||0)>=999?Infinity:(g.max||0);
    return chosen<minEff||(maxEff!==Infinity&&chosen>maxEff);
  });
  const ajuda = document.getElementById('combo-ajuda');
  const btn   = document.getElementById('combo-confirmar');
  if (invalidos.length) {
    if (ajuda) ajuda.textContent = 'Complete: ' + invalidos.map(g=>g.name).join(', ');
    if (btn)   btn.disabled = true;
  } else {
    const tot = Object.values(comboDraft.selection).reduce((s,q)=>s+q,0);
    if (ajuda) ajuda.textContent = tot + ' item(ns) selecionado(s)';
    if (btn)   btn.disabled = false;
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#combo-confirmar') && !e.target.closest('#combo-confirmar').disabled) {
    const p    = comboDraft.product;
    const comp = Object.entries(comboDraft.selection)
      .filter(([,q])=>q>0)
      .map(([id,q]) => {
        const op = byId(id);
        return {product_id:id, nome:op?.nome||'Componente', quantidade:q, preco:op?num(op.preco_venda):0};
      });
    cartUpsert({
      kind:'combo', product_id:p.id, nome:p.nome, categoria:p.categoria,
      tamanho:p.tamanho||null, foto_url:primaryImg(p),
      preco_base:num(p.preco_venda), preco_unit:num(p.preco_venda),
      quantidade:1, sabores:[], adicionais:[], componentes:comp,
      copo_tamanho:null, observacao:comboDraft.observacao.trim(), is_custom_copao:false,
    });
    renderCart();
    closeModal('modal-combo');
    showToast('Combo adicionado ✓', 'ok');
  }
});

// ============================================================
// MODAL MONTE SEU COPÃO
// ============================================================
let customDraft = null;

function openCustomCopao() {
  customDraft = { copao:{}, energetico:{}, gelo:{}, tamanho:null, observacao:'' };
  renderCustomCopao();
  document.getElementById('modal-copao-custom').classList.remove('hidden');
}

function buildCustomGrupos() {
  const atv = allProducts.filter(p => p.estoque > 0);
  return [
    {id:'copao',      label:'Copão',      emoji:'🍻', prods:atv.filter(p=>isCopao(p)), required:true,  max:5 },
    {id:'energetico', label:'Energético', emoji:'⚡', prods:atv.filter(p=>p.categoria==='Energéticos'), required:false, max:10},
    {id:'gelo',       label:'Gelo',       emoji:'🧊', prods:atv.filter(p=>p.categoria==='Gelo'),       required:false, max:10},
  ];
}

function calcCustomTotal() {
  if (!customDraft) return 0;
  let t = 0;
  ['copao','energetico','gelo'].forEach(g => {
    Object.entries(customDraft[g]).forEach(([id,q]) => { const p=byId(id); if(p) t+=num(p.preco_venda)*q; });
  });
  return t + num(customDraft.tamanho?.preco_extra);
}

function renderCustomCopao() {
  const grupos = buildCustomGrupos();
  let html = '';
  grupos.forEach(g => {
    const totSel = Object.values(customDraft[g.id]).reduce((s,q)=>s+q, 0);
    const ok = !g.required || totSel > 0;
    html += `
    <div class="combo-grupo">
      <div class="combo-grupo-head">
        <span class="combo-grupo-nome">${g.emoji} ${esc(g.label).toUpperCase()}</span>
        <span class="combo-grupo-contador ${ok?'ok':''}">${totSel}${g.max<999?' / '+g.max:''}</span>
      </div>
      <div class="combo-grupo-hint">${g.required?'Obrigatório · escolha 1 ou mais':'Opcional'}</div>`;
    if (!g.prods.length) {
      html += `<div style="font-size:12px;color:var(--text3);padding:8px 10px;background:var(--card);border-radius:8px">Nenhum produto cadastrado nesta categoria.</div>`;
    } else {
      g.prods.forEach(p => {
        const qty  = customDraft[g.id][p.id] || 0;
        const foto = primaryImg(p);
        html += `
        <div class="combo-opcao">
          <div class="combo-opcao-foto">
            ${foto
              ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" onerror="this.parentElement.innerHTML='<span class=fb>${catEmoji(p.categoria)}</span>'" />`
              : `<span class="fb">${catEmoji(p.categoria)}</span>`}
          </div>
          <div class="combo-opcao-info">
            <span class="combo-opcao-nome">${esc(p.nome)}</span>
            <span class="combo-opcao-extra">${fmt(p.preco_venda)}</span>
          </div>
          <div class="combo-opcao-ctrl">
            <button type="button" class="combo-ctrl-btn" data-cg="${g.id}" data-cid="${esc(p.id)}" data-cstep="-1" ${qty<=0?'disabled':''}>−</button>
            <span class="combo-ctrl-qty">${qty}</span>
            <button type="button" class="combo-ctrl-btn" data-cg="${g.id}" data-cid="${esc(p.id)}" data-cstep="1">+</button>
          </div>
        </div>`;
      });
    }
    html += `</div>`;
  });

  // tamanhos de copo
  const tamSel = customDraft.tamanho?.label || '';
  html += `
  <div class="combo-grupo">
    <div class="combo-grupo-head">
      <span class="combo-grupo-nome">🥤 TAMANHO DO COPO</span>
      <span class="combo-grupo-contador ${tamSel?'ok':''}">${tamSel||'nenhum'}</span>
    </div>
    <div class="combo-grupo-hint">Obrigatório</div>
    <div class="tamanhos-wrap">
      ${copaoTamanhos.map(t => `
        <button type="button" class="tamanho-btn${tamSel===t.label?' selected':''}"
          data-tamanho="${esc(t.label)}" data-extra="${num(t.preco_extra)}">
          ${esc(t.label)}${num(t.preco_extra)?`<span class="extra">+${fmt(t.preco_extra)}</span>`:''}
        </button>`).join('')}
    </div>
  </div>
  <div class="combo-grupo">
    <div class="pm-section-title" style="margin-top:0">Observação <span class="opt">opcional</span></div>
    <textarea class="pm-obs" id="custom-obs" placeholder="Ex: gelo à parte…">${esc(customDraft.observacao)}</textarea>
  </div>`;

  const cont = document.getElementById('copao-custom-grupos');
  cont.innerHTML = html;

  cont.querySelectorAll('[data-cstep]').forEach(btn =>
    btn.addEventListener('click', () => {
      const g  = btn.dataset.cg, cid = btn.dataset.cid, step = parseInt(btn.dataset.cstep,10);
      const grDef = buildCustomGrupos().find(x=>x.id===g);
      const cur = customDraft[g][cid] || 0;
      const grTot = Object.values(customDraft[g]).reduce((s,q)=>s+q,0) - cur + Math.max(0, cur+step);
      if (grTot > grDef.max && step > 0) { showToast(`Máximo ${grDef.max} neste grupo`,'erro'); return; }
      customDraft[g][cid] = Math.max(0, cur+step);
      renderCustomCopao();
    })
  );
  cont.querySelectorAll('[data-tamanho]').forEach(btn =>
    btn.addEventListener('click', () => {
      customDraft.tamanho = {label:btn.dataset.tamanho, preco_extra:num(btn.dataset.extra)};
      renderCustomCopao();
    })
  );
  document.getElementById('custom-obs')?.addEventListener('input', e => { customDraft.observacao = e.target.value; });

  const copSel  = Object.values(customDraft.copao).reduce((s,q)=>s+q,0);
  const tamOk   = !!customDraft.tamanho;
  const total   = calcCustomTotal();
  document.getElementById('copao-custom-preco').textContent = fmt(total);
  const ajuda   = document.getElementById('copao-custom-ajuda');
  const btnConf = document.getElementById('copao-custom-confirmar');
  if (!copSel)      { if(ajuda) ajuda.textContent='Escolha ao menos 1 copão';      if(btnConf) btnConf.disabled=true; }
  else if (!tamOk)  { if(ajuda) ajuda.textContent='Escolha o tamanho do copo';     if(btnConf) btnConf.disabled=true; }
  else {
    const tot = copSel+Object.values(customDraft.energetico).reduce((s,q)=>s+q,0)+Object.values(customDraft.gelo).reduce((s,q)=>s+q,0);
    if(ajuda) ajuda.textContent=`${tot} item(ns) · ${fmt(total)}`;
    if(btnConf) btnConf.disabled=false;
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#copao-custom-confirmar') && !e.target.closest('#copao-custom-confirmar').disabled) {
    const comp = [];
    ['copao','energetico','gelo'].forEach(g => {
      Object.entries(customDraft[g]).forEach(([id,q]) => {
        if (q>0) { const p=byId(id); comp.push({product_id:id,nome:p?.nome||'Item',quantidade:q,preco:p?num(p.preco_venda):0}); }
      });
    });
    cartUpsert({
      kind:'custom_copao', product_id:null, nome:'Monte seu Copão', categoria:'Copões',
      tamanho:customDraft.tamanho?.label||null, foto_url:'',
      preco_base:0, preco_unit:calcCustomTotal(),
      quantidade:1, sabores:[], adicionais:[], componentes:comp,
      copo_tamanho:customDraft.tamanho,
      observacao:customDraft.observacao.trim(), is_custom_copao:true,
    });
    renderCart();
    closeModal('modal-copao-custom');
    showToast('Copão adicionado ao pedido ✓','ok');
  }
});

// ============================================================
// CARRINHO
// ============================================================
function cartKey(item) {
  const comps = item.componentes.map(c=>`${c.product_id}x${c.quantidade}`).sort().join(',');
  const sab   = item.sabores.map(s=>s.id).sort().join(',');
  const adi   = item.adicionais.map(a=>a.product_id).sort().join(',');
  return `${item.is_custom_copao?'cust':item.product_id}|${comps}|${sab}|${adi}|${item.copo_tamanho?.label||''}|${item.observacao||''}`;
}
function cartUpsert(item) {
  const k = cartKey(item);
  const found = cart.find(x => cartKey(x)===k);
  if (found) found.quantidade += item.quantidade;
  else cart.push(item);
}
function itemUnit(item) {
  if (item.is_custom_copao) {
    return item.componentes.reduce((s,c)=>s+num(c.preco)*c.quantidade,0)
           + num(item.copo_tamanho?.preco_extra);
  }
  if (item.kind==='combo') return num(item.preco_base);
  return num(item.preco_base)
    + item.sabores.reduce((s,x)=>s+num(x.preco_extra),0)
    + item.adicionais.reduce((s,x)=>s+num(x.preco),0);
}
function itemSub(item) { return itemUnit(item)*item.quantidade; }
function cartTotal()   { return cart.reduce((s,x)=>s+itemSub(x),0); }
function totalItens()  { return cart.reduce((s,x)=>s+x.quantidade,0); }

function compText(item) {
  const parts = [];
  if (item.componentes.length) parts.push(item.componentes.map(c=>`${c.nome} ×${c.quantidade}`).join(' · '));
  if (item.sabores.length)     parts.push('Sabores: '+item.sabores.map(s=>s.nome).join(', '));
  if (item.adicionais.length)  parts.push('Adicionais: '+item.adicionais.map(a=>a.nome).join(', '));
  if (item.observacao)         parts.push('Obs: '+item.observacao);
  return parts.join(' · ');
}

function renderCart() {
  const body = document.getElementById('cart-items');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `<div class="cart-empty"><div class="ce-emoji">🛒</div><div>Seu pedido está vazio.</div></div>`;
  } else {
    body.innerHTML = cart.map((item, i) => `
      <div class="cart-item">
        <div class="cart-item-foto">
          ${item.foto_url
            ? `<img src="${esc(item.foto_url)}" alt="" onerror="this.parentElement.innerHTML='<span class=fb>🦉</span>'" />`
            : `<span class="fb">${item.is_custom_copao?'🎯':catEmoji(item.categoria)}</span>`}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-nome">${esc(item.nome)}${item.tamanho?' · '+esc(item.tamanho):''}</div>
          ${compText(item)?`<div class="cart-item-comp">${esc(compText(item))}</div>`:''}
          <div class="cart-item-preco">${fmt(itemUnit(item))} un · ${fmt(itemSub(item))}</div>
          <div class="cart-item-qty">
            <button type="button" class="qty-btn" data-ci="${i}" data-step="-1">−</button>
            <span class="qty-val">${item.quantidade}</span>
            <button type="button" class="qty-btn" data-ci="${i}" data-step="1">+</button>
            <button type="button" class="cart-item-remove" data-rm="${i}">Remover</button>
          </div>
        </div>
      </div>`).join('');

    body.querySelectorAll('[data-ci]').forEach(b =>
      b.addEventListener('click', () => {
        const i=parseInt(b.dataset.ci,10), step=parseInt(b.dataset.step,10);
        cart[i].quantidade = Math.max(1, cart[i].quantidade+step);
        renderCart();
      })
    );
    body.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', () => { cart.splice(parseInt(b.dataset.rm,10),1); renderCart(); })
    );
  }

  const tot = cartTotal();
  const q   = totalItens();
  const el  = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  el('cart-total', fmt(tot));
  el('cart-bar-total', fmt(tot));
  el('cart-badge', q);
  el('cart-bar-text', q===1?'1 item':`${q} itens`);
  const ce = document.getElementById('cart-enviar'); if(ce) ce.disabled = !cart.length;
  const cs = document.getElementById('cart-bar-send'); if(cs) cs.disabled = !cart.length;
  const bar = document.getElementById('cart-bar'); if(bar) bar.classList.toggle('fab-oculto', !cart.length);
  document.body.style.paddingBottom = cart.length ? '80px' : '0';
}

// ── DRAWER ────────────────────────────────────────────────
const openDrawer  = () => { document.getElementById('cart-drawer').classList.add('open'); document.getElementById('cart-drawer').setAttribute('aria-hidden','false'); document.getElementById('drawer-overlay').classList.add('open'); };
const closeDrawer = () => { document.getElementById('cart-drawer').classList.remove('open'); document.getElementById('cart-drawer').setAttribute('aria-hidden','true'); document.getElementById('drawer-overlay').classList.remove('open'); };

// ============================================================
// RECONFIRMAÇÃO DE PREÇO
// ============================================================
let reconfCtx = null;

async function enviarPedido(carrinho) {
  if (!carrinho.length) { showToast('Pedido vazio','erro'); return; }
  const ids = new Set();
  carrinho.forEach(item => {
    if (item.product_id) ids.add(item.product_id);
    item.componentes.forEach(c => ids.add(c.product_id));
    item.adicionais.forEach(a => ids.add(a.product_id));
  });
  let fresh = {};
  try {
    const slice = [...ids];
    const q = 'select=id,preco_venda,estoque,status&id=in.(' + slice.map(encodeURIComponent).join(',') + ')';
    const rows = await apiGet('menu_publico', q);
    rows.forEach(r => { fresh[r.id] = r; });
  } catch {
    showToast('Não foi possível conferir os preços. Tente novamente.','erro');
    return;
  }

  const alteracoes = [], validos = [];
  for (const item of carrinho) {
    let novoUnit = itemUnit(item), indisp = false, motivos = [];
    if (item.is_custom_copao) {
      let total = 0;
      for (const c of item.componentes) {
        const r = fresh[c.product_id];
        if (!r||r.status!=='ativo'||r.estoque<=0) { indisp=true; motivos.push(c.nome+' indisponível'); }
        else { total+=num(r.preco_venda)*c.quantidade; if(num(r.preco_venda)!==num(c.preco)) motivos.push(`${c.nome}: ${fmt(c.preco)}→${fmt(r.preco_venda)}`); }
      }
      novoUnit = total + num(item.copo_tamanho?.preco_extra);
    } else if (item.kind==='combo') {
      const r = fresh[item.product_id];
      if (!r||r.status!=='ativo') { indisp=true; motivos.push('Combo indisponível'); }
      else {
        if (num(r.preco_venda)!==num(item.preco_base)) { motivos.push(`preço: ${fmt(item.preco_base)}→${fmt(r.preco_venda)}`); novoUnit=num(r.preco_venda); }
        item.componentes.forEach(c => { const rc=fresh[c.product_id]; if(!rc||rc.estoque<=0){indisp=true;motivos.push(c.nome+' indisponível');} });
      }
    } else {
      const r = fresh[item.product_id];
      if (!r||r.status!=='ativo'||r.estoque<=0) { indisp=true; motivos.push('Esgotado'); }
      else {
        let u=num(r.preco_venda);
        item.adicionais.forEach(a => {
          const ra=fresh[a.product_id];
          if(!ra||ra.estoque<=0){indisp=true;motivos.push(a.nome+' indisponível');}
          else { u+=num(ra.preco_venda); if(num(ra.preco_venda)!==num(a.preco)) motivos.push(`${a.nome}: ${fmt(a.preco)}→${fmt(ra.preco_venda)}`); }
        });
        u += item.sabores.reduce((s,x)=>s+num(x.preco_extra),0);
        if (num(r.preco_venda)!==num(item.preco_base)) motivos.push(`preço: ${fmt(item.preco_base)}→${fmt(r.preco_venda)}`);
        novoUnit = u;
      }
    }
    if (indisp) alteracoes.push({item,indisp:true,motivos,novoUnit});
    else if (motivos.length||Math.abs(novoUnit-itemUnit(item))>0.001) { alteracoes.push({item,indisp:false,motivos,novoUnit}); validos.push({item,novoUnit,fresh}); }
    else validos.push({item,novoUnit,fresh});
  }

  if (!alteracoes.length) { abrirWhatsApp(carrinho); return; }

  // mostra modal de reconfirmação
  const novoTotal = validos.reduce((s,x)=>s+x.novoUnit*x.item.quantidade,0);
  let msg='';
  if (alteracoes.filter(a=>!a.indisp).length) msg+='Alguns preços foram atualizados. ';
  if (alteracoes.filter(a=>a.indisp).length)  msg+='Itens indisponíveis serão removidos. ';
  document.getElementById('reconfirma-text').textContent = msg+'Confira antes de enviar.';
  document.getElementById('reconfirma-lista').innerHTML = alteracoes.map(a=>`
    <div class="reconfirma-item ${a.indisp?'indisp':'alterou'}">
      <div class="ri-nome">${esc(a.item.nome)} ×${a.item.quantidade}</div>
      ${a.motivos.length?`<div class="ri-det">${esc(a.motivos.join(' · '))}</div>`:''}
      <div class="ri-tag ${a.indisp?'indisp':'alterou'}">${a.indisp?'Indisponível':'Preço alterado'}</div>
    </div>`).join('');
  document.getElementById('reconfirma-total').textContent = fmt(novoTotal);
  reconfCtx = { validos, fresh: validos[0]?.fresh };
  document.getElementById('modal-reconfirma').classList.remove('hidden');
}

document.addEventListener('click', e => {
  if (e.target.closest('#reconfirma-confirmar') && reconfCtx) {
    const { validos } = reconfCtx;
    cart = cart.filter(it => validos.some(x=>x.item===it));
    validos.forEach(({item,fresh}) => {
      if (item.is_custom_copao) item.componentes.forEach(c=>{const r=fresh[c.product_id];if(r)c.preco=num(r.preco_venda);});
      else { const r=fresh[item.product_id]; if(r) item.preco_base=num(r.preco_venda); item.adicionais.forEach(a=>{const ra=fresh[a.product_id];if(ra)a.preco=num(ra.preco_venda);}); }
    });
    closeModal('modal-reconfirma');
    reconfCtx = null;
    renderCart();
    if (!cart.length) { showToast('Nenhum item disponível para enviar.','erro'); return; }
    abrirWhatsApp(cart.slice());
  }
});

// ── WHATSAPP ──────────────────────────────────────────────
function buildMsg(carrinho) {
  const loja = lojaConfig.nome_loja || 'Adega Corujão';
  const linhas = [`🦉 *${loja.toUpperCase()}* — Pedido`, ''];
  carrinho.forEach(item => {
    const u = itemUnit(item), s = u*item.quantidade;
    let linha = `${item.quantidade}× ${item.nome}`;
    if (item.tamanho) linha += ` (${item.tamanho})`;
    linhas.push(linha);
    if (item.componentes.length) linhas.push('   '+item.componentes.map(c=>`• ${c.nome} ×${c.quantidade}`).join('\n   '));
    if (item.sabores.length)     linhas.push('   Sabores: '+item.sabores.map(x=>x.nome).join(', '));
    if (item.adicionais.length)  linhas.push('   Adicionais: '+item.adicionais.map(x=>x.nome).join(', '));
    if (item.observacao)         linhas.push('   Obs: '+item.observacao);
    linhas.push(`   ${fmt(u)} un. → ${fmt(s)}`, '');
  });
  const tot = carrinho.reduce((s,x)=>s+itemUnit(x)*x.quantidade,0);
  linhas.push(`*Total: ${fmt(tot)}*`);
  if (lojaConfig.retirada) linhas.push(`\n_${lojaConfig.retirada}_`);
  linhas.push('\n_Pedido enviado pelo cardápio online. Aguardo confirmação da adega._');
  return linhas.join('\n');
}

function whatsNum() {
  // fallback: número configurado da Adega Corujão
  const configured = (lojaConfig.whatsapp || '11957699647').replace(/\D/g, '');
  let n = configured;
  if (!n) return '';
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return n;
}

function abrirWhatsApp(carrinho) {
  const n = whatsNum();
  if (!n) { showToast('WhatsApp não configurado. Avise a adega.','erro'); return; }
  window.open('https://wa.me/'+n+'?text='+encodeURIComponent(buildMsg(carrinho)), '_blank', 'noopener');
}

// ── MODAIS ────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) closeModal(c.dataset.close);
  if (e.target.classList?.contains('modal')) e.target.classList.add('hidden');
});

// ── INFO DA LOJA ──────────────────────────────────────────
function renderLojaInfo() {
  const sec  = document.getElementById('loja-info');
  if (!sec) return;
  const dados = [
    {ic:'📍', lab:'Endereço',           val:lojaConfig.endereco},
    {ic:'🕒', lab:'Horário',            val:lojaConfig.horario},
    {ic:'🛵', lab:'Retirada / Entrega', val:lojaConfig.retirada},
    {ic:'💬', lab:'WhatsApp',           val:lojaConfig.whatsapp ? lojaConfig.whatsapp.replace(/\D/g,'') : ''},
  ].filter(d=>d.val);
  if (!dados.length) { sec.hidden=true; return; }
  sec.hidden=false;
  document.getElementById('loja-info-grid').innerHTML = dados.map(d=>`
    <div class="loja-info-item">
      <span class="ic">${d.ic}</span>
      <div><div class="lab">${esc(d.lab)}</div><div class="val">${esc(d.val)}</div></div>
    </div>`).join('');
}

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  document.getElementById('cart-bar-info')?.addEventListener('click', openDrawer);
  document.getElementById('cart-bar-send')?.addEventListener('click', () => enviarPedido(cart.slice()));
  document.getElementById('cart-enviar')?.addEventListener('click', () => { closeDrawer(); enviarPedido(cart.slice()); });
  document.getElementById('cart-limpar')?.addEventListener('click', () => { if(cart.length&&confirm('Limpar pedido?')){cart=[];renderCart();} });
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);

  loadAll();

  // Atualiza quando o usuário volta à aba ou ao navegador
  // (muito melhor que setInterval — só roda quando realmente precisa)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadAll();
  });
  window.addEventListener('focus', loadAll);
});

function setupSearch() {
  const inp = document.getElementById('busca-produto');
  if (!inp) return;
  let t = null;
  inp.addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => { searchQuery=e.target.value.trim(); renderChips(); renderCardapio(); }, 180);
  });
}
