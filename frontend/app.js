/* ═══════════════════════════════════════════════════════════════════════════
   RetroTV — app.js  (ES5 — compatível com Android TV / WebView antigo)
═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─── Teclas (D-pad Android TV + teclado) ─────────────────────────────────
  function isUp(e)     { return e.key === 'ArrowUp'    || e.keyCode === 38; }
  function isDown(e)   { return e.key === 'ArrowDown'  || e.keyCode === 40; }
  function isLeft(e)   { return e.key === 'ArrowLeft'  || e.keyCode === 37; }
  function isRight(e)  { return e.key === 'ArrowRight' || e.keyCode === 39; }
  function isEnter(e)  { return e.key === 'Enter'  || e.keyCode === 13; }
  function isBack(e)   { return e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 8; }
  function isDelete(e) { return e.key === 'Delete' || e.keyCode === 46; }

  // ─── INDEXEDDB ─────────────────────────────────────────────────────────────
  var DB_NAME = 'RetroTVDB';
  var DB_VER  = 1;
  var STORE   = 'roms';
  var db      = null;

  function abrirDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function dbPut(obj) {
    return new Promise(function (resolve, reject) {
      var tx  = db.transaction(STORE, 'readwrite');
      var req = tx.objectStore(STORE).put(obj);
      req.onsuccess = function () { resolve(); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function dbDelete(id) {
    return new Promise(function (resolve, reject) {
      var tx  = db.transaction(STORE, 'readwrite');
      var req = tx.objectStore(STORE).delete(id);
      req.onsuccess = function () { resolve(); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function dbClear() {
    return new Promise(function (resolve, reject) {
      var tx  = db.transaction(STORE, 'readwrite');
      var req = tx.objectStore(STORE).clear();
      req.onsuccess = function () { resolve(); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  // ─── LOCALSTORAGE ─────────────────────────────────────────────────────────
  var LS_KEY    = 'retrotv_library';
  var LS_ULTIMO = 'retrotv_ultimo';
  var LS_CDN    = 'retrotv_cdn';

  function carregarBiblioteca() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function salvarBiblioteca(lib) { localStorage.setItem(LS_KEY, JSON.stringify(lib)); }
  function getCDN() { return localStorage.getItem(LS_CDN) || 'https://cdn.emulatorjs.org/stable/data/'; }
  function setCDN(v) { localStorage.setItem(LS_CDN, v); }

  // ─── ROTEADOR DE TELAS ─────────────────────────────────────────────────────
  var telaAtual = 'home';

  function irPara(tela) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    var el = document.getElementById('screen-' + tela);
    if (el) { el.classList.add('active'); telaAtual = tela; focarPrimeiro(el); }
  }

  function focarPrimeiro(el) {
    var sels = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';
    var els  = el.querySelectorAll(sels);
    if (els.length) els[0].focus();
  }

  // ─── HELPER: simular click em elemento focado ─────────────────────────────
  // Necessário pois em Android TV antigo, Enter no D-pad pode não disparar click
  function clicarFocado() {
    var el = document.activeElement;
    if (el && el !== document.body) {
      el.click();
      return true;
    }
    return false;
  }

  // ─── ÍCONES / NOMES ───────────────────────────────────────────────────────
  var ICONS = {
    nes:'🎮', snes:'🕹️', gba:'🎯', gb:'📱', gbc:'📱', n64:'🕹️',
    segaMD:'⚡', psx:'💿', segaMS:'📺', segaGG:'🎮', arcade:'🕹️'
  };
  var NOMES_CORE = {
    nes:'NES', snes:'SNES', gba:'Game Boy Advance', gb:'Game Boy',
    gbc:'Game Boy Color', n64:'Nintendo 64', segaMD:'Mega Drive',
    psx:'PlayStation', segaMS:'Master System', segaGG:'Game Gear', arcade:'Arcade'
  };
  function icone(core)    { return ICONS[core] || '🎮'; }
  function nomeCore(core) { return NOMES_CORE[core] || core; }
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function gerarID() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function escHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── BIBLIOTECA ───────────────────────────────────────────────────────────
  function renderizarBiblioteca() {
    var lista = document.getElementById('game-list');
    var empty = document.getElementById('empty-biblioteca');
    var jogos = carregarBiblioteca();
    var cards = lista.querySelectorAll('.game-card');
    for (var i = 0; i < cards.length; i++) cards[i].remove();

    if (jogos.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    jogos.forEach(function (jogo) {
      var card = document.createElement('div');
      card.className = 'game-card';
      card.tabIndex  = 0;
      card.dataset.id = jogo.id;
      card.innerHTML =
        '<span class="game-card-icon">' + icone(jogo.core) + '</span>' +
        '<div class="game-card-info">' +
          '<div class="game-card-name">' + escHTML(jogo.nome) + '</div>' +
          '<div class="game-card-core">' + nomeCore(jogo.core) + '</div>' +
        '</div>' +
        '<span class="game-card-size">' + formatBytes(jogo.tamanho || 0) + '</span>' +
        '<button class="game-card-del" tabindex="-1" title="Remover">🗑</button>';

      card.addEventListener('click', function (e) {
        if (e.target.classList.contains('game-card-del')) {
          confirmar('Remover "' + jogo.nome + '" da biblioteca?', function () { removerJogo(jogo.id); });
        } else {
          jogar(jogo);
        }
      });

      card.addEventListener('keydown', function (e) {
        if (isEnter(e)) { e.preventDefault(); jogar(jogo); }
        else if (isDelete(e)) {
          confirmar('Remover "' + jogo.nome + '" da biblioteca?', function () { removerJogo(jogo.id); });
        } else { navegarLista(e, lista); }
      });

      lista.appendChild(card);
    });
  }

  function navegarLista(e, lista) {
    var cards = Array.from ? Array.from(lista.querySelectorAll('.game-card'))
                           : [].slice.call(lista.querySelectorAll('.game-card'));
    var idx = cards.indexOf(document.activeElement);
    if (idx === -1) return;
    if (isDown(e) && idx < cards.length - 1) { e.preventDefault(); cards[idx + 1].focus(); }
    else if (isUp(e)) {
      e.preventDefault();
      if (idx > 0) cards[idx - 1].focus();
      else document.getElementById('back-biblioteca').focus();
    }
  }

  function removerJogo(id) {
    salvarBiblioteca(carregarBiblioteca().filter(function (j) { return j.id !== id; }));
    dbDelete(id).catch(function () {});
    renderizarBiblioteca();
  }

  function jogar(jogo) {
    var cdn = getCDN();
    sessionStorage.setItem('retrotv_current', JSON.stringify({
      id: jogo.id, nome: jogo.nome, core: jogo.core, cdn: cdn
    }));
    localStorage.setItem(LS_ULTIMO, JSON.stringify(jogo));
    window.location.href = 'player.html';
  }

  // ─── IMPORTAR ─────────────────────────────────────────────────────────────
  var arquivoSelecionado = null;

  document.getElementById('inp-arquivo').addEventListener('change', function () {
    var f = this.files[0];
    if (f) {
      arquivoSelecionado = f;
      document.getElementById('arquivo-nome').textContent = f.name + ' (' + formatBytes(f.size) + ')';
      if (!document.getElementById('inp-nome').value.trim()) {
        document.getElementById('inp-nome').value = f.name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ');
      }
    }
  });

  document.getElementById('label-arquivo').addEventListener('keydown', function (e) {
    if (isEnter(e)) { e.preventDefault(); document.getElementById('inp-arquivo').click(); }
  });

  document.getElementById('btn-confirmar-import').addEventListener('click', confirmarImport);
  document.getElementById('btn-confirmar-import').addEventListener('keydown', function (e) {
    if (isEnter(e)) { e.preventDefault(); confirmarImport(); }
  });

  function confirmarImport() {
    var nome   = document.getElementById('inp-nome').value.trim();
    var core   = document.getElementById('inp-sistema').value;
    var status = document.getElementById('import-status');

    if (!nome) {
      status.style.color = '#ff4d4d'; status.textContent = '⚠ Digite o nome do jogo.';
      document.getElementById('inp-nome').focus(); return;
    }
    if (!arquivoSelecionado) {
      status.style.color = '#ff4d4d'; status.textContent = '⚠ Selecione um arquivo ROM.';
      document.getElementById('label-arquivo').focus(); return;
    }
    status.style.color = '#888899'; status.textContent = '⏳ Salvando...';
    document.getElementById('btn-confirmar-import').disabled = true;

    var id      = gerarID();
    var tamanho = arquivoSelecionado.size;
    var reader  = new FileReader();
    reader.onload = function (e) {
      dbPut({ id: id, dados: e.target.result }).then(function () {
        var lib = carregarBiblioteca();
        lib.push({ id: id, nome: nome, core: core, tamanho: tamanho });
        salvarBiblioteca(lib);
        status.style.color = '#00e676';
        status.textContent = '✔ "' + nome + '" adicionado!';
        document.getElementById('inp-nome').value = '';
        document.getElementById('arquivo-nome').textContent = 'Nenhum arquivo selecionado';
        arquivoSelecionado = null;
        document.getElementById('inp-arquivo').value = '';
        document.getElementById('btn-confirmar-import').disabled = false;
        setTimeout(function () { status.textContent = ''; }, 3000);
      }).catch(function (err) {
        status.style.color = '#ff4d4d'; status.textContent = '❌ Erro: ' + err;
        document.getElementById('btn-confirmar-import').disabled = false;
      });
    };
    reader.onerror = function () {
      status.style.color = '#ff4d4d'; status.textContent = '❌ Erro ao ler arquivo.';
      document.getElementById('btn-confirmar-import').disabled = false;
    };
    reader.readAsArrayBuffer(arquivoSelecionado);
  }

  // ─── MENU HOME ────────────────────────────────────────────────────────────
  function executarAcao(action) {
    if (action === 'continuar') {
      try {
        var ultimo = JSON.parse(localStorage.getItem(LS_ULTIMO) || 'null');
        if (ultimo && ultimo.id) { jogar(ultimo); return; }
      } catch (err) {}
      alert('Nenhum jogo jogado recentemente.');
    } else if (action === 'biblioteca') {
      renderizarBiblioteca(); irPara('biblioteca');
    } else if (action === 'importar') {
      irPara('importar');
    } else if (action === 'configuracoes') {
      document.getElementById('cfg-cdn').value = getCDN();
      irPara('config');
    }
  }

  var homeMenu = document.getElementById('home-menu');

  homeMenu.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.menu-btn') : buscarParent(e.target, 'menu-btn');
    if (btn) executarAcao(btn.dataset.action);
  });

  homeMenu.addEventListener('keydown', function (e) {
    var btns = [].slice.call(this.querySelectorAll('.menu-btn'));
    var idx  = btns.indexOf(document.activeElement);
    if (isDown(e) && idx < btns.length - 1) { e.preventDefault(); btns[idx + 1].focus(); }
    else if (isUp(e) && idx > 0)            { e.preventDefault(); btns[idx - 1].focus(); }
    else if (isEnter(e) && idx !== -1)      { e.preventDefault(); btns[idx].click(); }
  });

  function buscarParent(el, cls) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains(cls)) return el;
      el = el.parentNode;
    }
    return null;
  }

  // ─── BOTÕES VOLTAR ────────────────────────────────────────────────────────
  ['biblioteca', 'importar', 'config'].forEach(function (t) {
    var btn = document.getElementById('back-' + t);
    btn.addEventListener('click', function () { irPara('home'); });
    btn.addEventListener('keydown', function (e) {
      if (isEnter(e) || isBack(e)) { e.preventDefault(); irPara('home'); }
    });
  });

  // ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────
  document.getElementById('cfg-cdn').addEventListener('change', function () { setCDN(this.value); });

  var btnLimpar = document.getElementById('btn-limpar');
  btnLimpar.addEventListener('click', function () {
    confirmar('Limpar toda a biblioteca?', function () {
      salvarBiblioteca([]); dbClear().catch(function () {});
      localStorage.removeItem(LS_ULTIMO);
    });
  });
  btnLimpar.addEventListener('keydown', function (e) {
    if (isEnter(e)) { e.preventDefault(); this.click(); }
  });

  // ─── MODAL ────────────────────────────────────────────────────────────────
  var modalCallback = null;

  function confirmar(msg, callback) {
    document.getElementById('modal-msg').textContent = msg;
    document.getElementById('modal-overlay').classList.remove('hidden');
    modalCallback = callback;
    document.getElementById('modal-nao').focus();
  }

  document.getElementById('modal-sim').addEventListener('click', function () {
    document.getElementById('modal-overlay').classList.add('hidden');
    if (modalCallback) modalCallback();
    modalCallback = null;
  });

  document.getElementById('modal-nao').addEventListener('click', function () {
    document.getElementById('modal-overlay').classList.add('hidden');
    modalCallback = null;
  });

  document.getElementById('modal-overlay').addEventListener('keydown', function (e) {
    if (isBack(e)) {
      document.getElementById('modal-overlay').classList.add('hidden');
      modalCallback = null;
    }
    if (isLeft(e) || isRight(e)) {
      var sim = document.getElementById('modal-sim');
      var nao = document.getElementById('modal-nao');
      if (document.activeElement === sim) nao.focus(); else sim.focus();
    }
    if (isEnter(e)) { e.preventDefault(); document.activeElement.click(); }
  });

  // ─── BACKSPACE GLOBAL → VOLTAR ────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace' || e.keyCode === 8) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (telaAtual !== 'home') { e.preventDefault(); irPara('home'); }
    }
  });

  // ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────
  abrirDB().then(function () {
    irPara('home');
  }).catch(function (err) {
    console.error('Erro ao abrir DB:', err);
    irPara('home');
  });

})();
