// ============================================================
// ADEGA CORUJÃO — PAINEL DO CARDÁPIO (admin.js)
// ------------------------------------------------------------
// Acesso autenticado (mesmo login do sistema da adega).
// Permite: ligar/desligar visibilidade pública, editar descrição
// e tamanho, configurar dados da loja, tamanhos e sabores de copão.
// ============================================================

const SUPABASE_URL = 'https://fykqqioozgotmmebtlix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let produtos = [];
let categorias = [];
let busca = '';
let filtroCat = '';

// ── util ──────────────────────────────────────────────────
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmt(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
let toastTimer=null;
function toast(msg,tipo=''){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.className='toast '+tipo;if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2600);}

// ============================================================
// SESSÃO
// ============================================================
async function init() {
  const { data } = await client.auth.getSession();
  if (data.session) showPainel(); else showLogin();
}

function showLogin() {
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('painel').classList.add('hidden');
}
function showPainel() {
  document.getElementById('login-box').classList.add('hidden');
  document.getElementById('painel').classList.remove('hidden');
  loadCategorias();
  loadProdutos();
  loadLojaConfig();
  loadTamanhos();
  loadSabores();
}

// login
document.getElementById('form-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erro = document.getElementById('login-erro');
  erro.hidden = true;
  const { error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) {
    erro.textContent = 'Não foi possível entrar: ' + (error.message || 'verifique e-mail e senha.');
    erro.hidden = false;
    return;
  }
  showPainel();
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await client.auth.signOut();
  location.reload();
});

// ============================================================
// ABAS
// ============================================================
document.getElementById('admin-tabs')?.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  document.querySelectorAll('#admin-tabs .chip').forEach(c => c.classList.toggle('active', c === b));
  document.querySelectorAll('.atab').forEach(s => s.classList.toggle('hidden', s.id !== 'atab-' + b.dataset.atab));
});

// ============================================================
// CATEGORIAS
// ============================================================
async function loadCategorias() {
  const { data } = await client.from('categorias').select('*').eq('ativo', true).order('ordem').order('nome');
  categorias = data || [];
  // preenche selects
  const fc = document.getElementById('admin-filtro-cat');
  if (fc) fc.innerHTML = '<option value="">Todas categorias</option>' + categorias.map(c => `<option value="${esc(c.nome)}">${esc(c.emoji)} ${esc(c.nome)}</option>`).join('');
  const sc = document.getElementById('sab-cat');
  if (sc) sc.innerHTML = '<option value="">Todos os copões</option>' + categorias.filter(c => (c.nome||'').toLowerCase().startsWith('copõ')).map(c => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('');
}

// ============================================================
// PRODUTOS — visibilidade, descrição, tamanho
// ============================================================
async function loadProdutos() {
  const { data, error } = await client.from('produtos').select('*').order('nome');
  if (error) { toast('Erro ao carregar produtos: ' + error.message, 'erro'); return; }
  produtos = data || [];
  renderProdutos();
}

function renderProdutos() {
  let lista = produtos.slice();
  if (filtroCat) lista = lista.filter(p => p.categoria === filtroCat);
  if (busca) {
    const q = busca.toLowerCase();
    lista = lista.filter(p => p.nome?.toLowerCase().includes(q));
  }
  const cont = document.getElementById('admin-produtos-lista');
  if (!lista.length) { cont.innerHTML = '<p class="admin-hint">Nenhum produto encontrado.</p>'; return; }
  cont.innerHTML = lista.map(p => {
    const foto = p.fotos_urls?.[0] || p.foto_url || '';
    const emoji = categorias.find(c => c.nome === p.categoria)?.emoji || '📦';
    return `
    <div class="admin-prod-item" data-id="${esc(p.id)}">
      <div class="ap-foto">${foto ? `<img src="${esc(foto)}" alt="" onerror="this.parentElement.innerHTML='<span class=fb>${emoji}</span>'" />` : `<span class="fb">${emoji}</span>`}</div>
      <div class="ap-info">
        <div class="ap-nome">${esc(p.nome)}</div>
        <div class="ap-cat">${esc(p.categoria)} · estoque: ${p.estoque ?? 0}</div>
        <div class="ap-preco">${fmt(p.preco_venda)}</div>
        <div class="ap-campos">
          <input type="text" class="desc" placeholder="Descrição curta para o cardápio" value="${esc(p.descricao_publica||'')}" data-field="descricao_publica" />
          <input type="text" class="tam" placeholder="Tamanho (ex: 600ml)" value="${esc(p.tamanho||'')}" data-field="tamanho" />
        </div>
      </div>
      <div class="ap-visivel">
        <button type="button" class="toggle-visivel ${p.visivel_publico ? 'on' : ''}" data-toggle="${esc(p.id)}" aria-label="Visível no cardápio"></button>
        <span class="ap-visivel-label">${p.visivel_publico ? 'Visível' : 'Oculto'}</span>
      </div>
    </div>`;
  }).join('');

  // toggle visibilidade
  cont.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggle;
      const p = produtos.find(x => x.id === id);
      const novo = !p.visivel_publico;
      btn.disabled = true;
      const { error } = await client.from('produtos').update({ visivel_publico: novo }).eq('id', id);
      btn.disabled = false;
      if (error) { toast('Erro ao atualizar: ' + error.message, 'erro'); return; }
      p.visivel_publico = novo;
      btn.classList.toggle('on', novo);
      btn.nextElementSibling.textContent = novo ? 'Visível' : 'Oculto';
      toast(novo ? 'Produto visível no cardápio' : 'Produto ocultado do cardápio', 'ok');
    });
  });
  // descricao / tamanho (salva ao sair do campo)
  cont.querySelectorAll('[data-field]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = inp.closest('[data-id]').dataset.id;
      const field = inp.dataset.field;
      const valor = inp.value.trim();
      const { error } = await client.from('produtos').update({ [field]: valor || null }).eq('id', id);
      if (error) { toast('Erro ao salvar: ' + error.message, 'erro'); return; }
      const p = produtos.find(x => x.id === id); if (p) p[field] = valor;
      toast('Salvo', 'ok');
    });
  });
}

document.getElementById('admin-busca')?.addEventListener('input', e => { busca = e.target.value.trim(); renderProdutos(); });
document.getElementById('admin-filtro-cat')?.addEventListener('change', e => { filtroCat = e.target.value; renderProdutos(); });

// ============================================================
// LOJA — configurações
// ============================================================
async function loadLojaConfig() {
  const { data } = await client.from('loja_config').select('chave,valor');
  const cfg = Object.fromEntries((data || []).map(r => [r.chave, r.valor || '']));
  document.querySelectorAll('[data-cfg]').forEach(inp => { inp.value = cfg[inp.dataset.cfg] || ''; });
}

document.getElementById('form-loja')?.addEventListener('submit', async e => {
  e.preventDefault();
  const inputs = document.querySelectorAll('[data-cfg]');
  let ok = true;
  for (const inp of inputs) {
    const chave = inp.dataset.cfg;
    const valor = inp.value;
    const { error } = await client.from('loja_config').upsert({ chave, valor, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) { ok = false; toast(`Erro ao salvar ${chave}: ${error.message}`, 'erro'); }
  }
  if (ok) toast('Dados da loja salvos', 'ok');
});

// ============================================================
// TAMANHOS DE COPO
// ============================================================
async function loadTamanhos() {
  const { data } = await client.from('copao_tamanhos').select('*').order('ordem');
  const cont = document.getElementById('tamanhos-lista');
  if (!data || !data.length) { cont.innerHTML = '<p class="admin-hint">Nenhum tamanho cadastrado.</p>'; return; }
  cont.innerHTML = data.map(t => `
    <div class="admin-sub-item ${t.ativo ? '' : 'inativo'}">
      <div class="asi-info">${esc(t.label)}${num(t.preco_extra) ? `<span class="asi-extra">+${fmt(t.preco_extra)}</span>` : ''}${t.ativo ? '' : ' <span class="asi-cat">inativo</span>'}</div>
      <div style="display:flex;gap:6px">
        <button data-tam-toggle="${esc(t.id)}" data-ativo="${t.ativo}">${t.ativo ? 'Desativar' : 'Ativar'}</button>
        <button data-tam-del="${esc(t.id)}" style="margin-left:4px">Excluir</button>
      </div>
    </div>`).join('');
  cont.querySelectorAll('[data-tam-toggle]').forEach(b => b.addEventListener('click', () => toggleTamanho(b.dataset.ativo === 'true', b.dataset['tamToggle'])));
  cont.querySelectorAll('[data-tam-del]').forEach(b => b.addEventListener('click', () => delTamanho(b.dataset['tamDel'])));
}

function num(v){return Number(v||0);}

async function toggleTamanho(ativo, id) {
  const { error } = await client.from('copao_tamanhos').update({ ativo: !ativo }).eq('id', id);
  if (error) return toast('Erro: ' + error.message, 'erro');
  loadTamanhos(); toast('Atualizado', 'ok');
}
async function delTamanho(id) {
  if (!confirm('Excluir este tamanho?')) return;
  const { error } = await client.from('copao_tamanhos').delete().eq('id', id);
  if (error) return toast('Erro: ' + error.message, 'erro');
  loadTamanhos(); toast('Excluído', 'ok');
}

document.getElementById('form-tamanho')?.addEventListener('submit', async e => {
  e.preventDefault();
  const label = document.getElementById('tam-label').value.trim();
  const extra = num(document.getElementById('tam-extra').value);
  if (!label) return;
  const { count } = await client.from('copao_tamanhos').select('*', { count: 'exact', head: true });
  const { error } = await client.from('copao_tamanhos').insert([{ label, preco_extra: extra, ordem: (count || 0) + 1, ativo: true }]);
  if (error) return toast('Erro: ' + error.message, 'erro');
  document.getElementById('tam-label').value = '';
  document.getElementById('tam-extra').value = '0';
  loadTamanhos(); toast('Tamanho adicionado', 'ok');
});

// ============================================================
// SABORES DE COPÃO
// ============================================================
async function loadSabores() {
  const { data } = await client.from('copao_sabores').select('*').order('ordem').order('nome');
  const cont = document.getElementById('sabores-lista');
  if (!data || !data.length) { cont.innerHTML = '<p class="admin-hint">Nenhum sabor cadastrado.</p>'; return; }
  cont.innerHTML = data.map(s => `
    <div class="admin-sub-item ${s.ativo ? '' : 'inativo'}">
      <div class="asi-info">${esc(s.nome)}${num(s.preco_extra) ? `<span class="asi-extra">+${fmt(s.preco_extra)}</span>` : ''}${s.categoria_copao ? `<span class="asi-cat">· ${esc(s.categoria_copao)}</span>` : '<span class="asi-cat">· todos</span>'}${s.ativo ? '' : ' <span class="asi-cat">inativo</span>'}</div>
      <div style="display:flex;gap:6px">
        <button data-sab-toggle="${esc(s.id)}" data-ativo="${s.ativo}">${s.ativo ? 'Desativar' : 'Ativar'}</button>
        <button data-sab-del="${esc(s.id)}" style="margin-left:4px">Excluir</button>
      </div>
    </div>`).join('');
  cont.querySelectorAll('[data-sab-toggle]').forEach(b => b.addEventListener('click', () => toggleSabor(b.dataset.ativo === 'true', b.dataset['sabToggle'])));
  cont.querySelectorAll('[data-sab-del]').forEach(b => b.addEventListener('click', () => delSabor(b.dataset['sabDel'])));
}
async function toggleSabor(ativo, id) {
  const { error } = await client.from('copao_sabores').update({ ativo: !ativo }).eq('id', id);
  if (error) return toast('Erro: ' + error.message, 'erro');
  loadSabores(); toast('Atualizado', 'ok');
}
async function delSabor(id) {
  if (!confirm('Excluir este sabor?')) return;
  const { error } = await client.from('copao_sabores').delete().eq('id', id);
  if (error) return toast('Erro: ' + error.message, 'erro');
  loadSabores(); toast('Excluído', 'ok');
}
document.getElementById('form-sabor')?.addEventListener('submit', async e => {
  e.preventDefault();
  const nome = document.getElementById('sab-nome').value.trim();
  const cat = document.getElementById('sab-cat').value || null;
  const extra = num(document.getElementById('sab-extra').value);
  if (!nome) return;
  const { count } = await client.from('copao_sabores').select('*', { count: 'exact', head: true });
  const { error } = await client.from('copao_sabores').insert([{ nome, categoria_copao: cat, preco_extra: extra, ordem: (count || 0) + 1, ativo: true }]);
  if (error) return toast('Erro: ' + error.message, 'erro');
  document.getElementById('sab-nome').value = '';
  document.getElementById('sab-extra').value = '0';
  loadSabores(); toast('Sabor adicionado', 'ok');
});

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', init);
client.auth.onAuthStateChange((_e, session) => {
  if (session) {/* já no painel */} else { if (!document.getElementById('painel').classList.contains('hidden')) showLogin(); }
});
