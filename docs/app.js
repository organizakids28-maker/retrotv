/* ═══════════════════════════════════════════════════════════════════════════
   RetroTV — app.js
   Gerencia biblioteca, importação e navegação por teclado.
   Armazena ROMs em IndexedDB. Metadados em localStorage.
═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

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
  var LS_KEY      = 'retrotv_library';
  var LS_ULTIMO   = 'retrotv_ultimo';
  var LS_CDN      = 'retrotv_cdn';

  function carregarBiblioteca() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function salvarBiblioteca(lib) {
    localStorage.setItem(LS_KEY, JSON.stringify(lib));
  }

  function getCDN() {
    return localStorage.getItem(LS_CDN) || 'https://cdn.emulatorjs.org/stable/data/';
  }
  function setCDN(v) { localStorage.setItem(LS_CDN, v); }

  // ─── ROTEADOR DE TELAS ─────────────────────────────────────────────────────
  var telaAtual = 'home';

  function irPara(tela) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    var el = document.getElementById('screen-' + tela);
    if (el) {
      el.classList.add('active');
      telaAtual = tela;
      focarPrimeiro(el);
    }
  }

  function focarPrimeiro(el) {
    var focusable = el.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'
    );
    if (focusable.length) focusable[0].focus();
  }

  // ─── ÍCONES POR CORE ──────────────────────────────────────────────────────
  var ICONS = {
    nes:    '🎮', snes:   '🕹️', gba:    '🎯',
    gb:     '📱', gbc:    '📱', n64:    '🕹️',
    segaMD: '⚡', psx:    '💿', segaMS: '📺',
    segaGG: '🎮', arcade: '🕹️'
  };

  var NOMES_CORE = {
    nes:    'NES',        snes:   'SNES',
    gba:    'Game Boy Advance', gb: 'Game Boy',
    gbc:    'Game Boy Color',   n64: 'Nintendo 64',
    segaMD: 'Mega Drive',       psx: 'PlayStation',
    segaMS: 'Master System',    segaGG: 'Game Gear',
    arcade: 'Arcade'
  };

  function icone(core) { return ICONS[core] || '🎮'; }
  function nomeCore(core) { return NOMES_CORE[core] || core; }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function gerarID() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ─── BIBLIOTECA ───────────────────────────────────────────────────────────
  function renderizarBiblioteca() {
    var lista  = document.getElementById('game-list');
    var empty  = document.getElementById('empty-biblioteca');
    var jogos  = carregarBiblioteca();

    // Remover cards antigos
    lista.querySelectorAll('.game-card').forEach(function (c) { c.remove(); });

    if (jogos.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    jogos.forEach(function (jogo, idx) {
      var card = document.createElement('div');
      card.className = 'game-card';
      card.tabIndex = 0;
      card.dataset.id = jogo.id;
      card.dataset.idx = idx;
      card.innerHTML =
        '<span class="game-card-icon">' + icone(jogo.core) + '</span>' +
        '<div class="game-card-info">' +
          '<div class="game-card-name">' + escHTML(jogo.nome) + '</div>' +
          '<div class="game-card-core">' + nomeCore(jogo.core) + '</div>' +
        '</div>' +
        '<span class="game-card-size">' + formatBytes(jogo.tamanho || 0) + '</span>' +
        '<button class="game-card-del" title="Remover" tabindex="-1">🗑</button>';

      card.addEventListener('click', function (e) {
        if (e.target.classList.contains('game-card-del')) {
          confirmar('Remover "' + jogo.nome + '" da biblioteca?', function () {
            removerJogo(jogo.id);
          });
        } else {
          jogar(jogo);
        }
      });

      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jogar(jogo); }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          confirmar('Remover "' + jogo.nome + '" da biblioteca?', function () {
            removerJogo(jogo.id);
          });
        }
        navegarLista(e, lista);
      });

      lista.appendChild(card);
    });
  }

  function navegarLista(e, lista) {
    var cards = Array.from(lista.querySelectorAll('.game-card'));
    var atual = document.activeElement;
    var idx   = cards.indexOf(atual);
    if (idx === -1) return;
    if (e.key === 'ArrowDown' && idx < cards.length - 1) {
      e.preventDefault(); cards[idx + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) cards[idx - 1].focus();
      else document.getElementById('back-biblioteca').focus();
    }
  }

  function removerJogo(id) {
    var lib = carregarBiblioteca().filter(function (j) { return j.id !== id; });
    salvarBiblioteca(lib);
    dbDelete(id).catch(function () {});
    renderizarBiblioteca();
  }

  function jogar(jogo) {
    var cdn = getCDN();
    sessionStorage.setItem('retrotv_current', JSON.stringify({
      id:   jogo.id,
      nome: jogo.nome,
      core: jogo.core,
      cdn:  cdn
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
      document.getElementById('arquivo-nome').textContent =
        f.name + ' (' + formatBytes(f.size) + ')';
      if (!document.getElementById('inp-nome').value.trim()) {
        var nome = f.name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ');
        document.getElementById('inp-nome').value = nome;
      }
    }
  });

  // Teclado no label do arquivo
  document.getElementById('label-arquivo').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('inp-arquivo').click();
    }
  });

  document.getElementById('btn-confirmar-import').addEventListener('click', function () {
    var nome    = document.getElementById('inp-nome').value.trim();
    var core    = document.getElementById('inp-sistema').value;
    var status  = document.getElementById('import-status');

    if (!nome) {
      status.style.color = '#ff4d4d';
      status.textContent = '⚠ Digite o nome do jogo.';
      document.getElementById('inp-nome').focus();
      return;
    }
    if (!arquivoSelecionado) {
      status.style.color = '#ff4d4d';
      status.textContent = '⚠ Selecione um arquivo ROM.';
      document.getElementById('label-arquivo').focus();
      return;
    }

    status.style.color = '#888899';
    status.textContent = '⏳ Salvando...';
    document.getElementById('btn-confirmar-import').disabled = true;

    var id      = gerarID();
    var tamanho = arquivoSelecionado.size;
    var reader  = new FileReader();

    reader.onload = function (e) {
      var dados = e.target.result; // ArrayBuffer
      dbPut({ id: id, dados: dados }).then(function () {
        var jogo = { id: id, nome: nome, core: core, tamanho: tamanho };
        var lib  = carregarBiblioteca();
        lib.push(jogo);
        salvarBiblioteca(lib);

        status.style.color = '#00e676';
        status.textContent = '✔ "' + nome + '" adicionado à biblioteca!';
        document.getElementById('inp-nome').value  = '';
        document.getElementById('arquivo-nome').textContent = 'Nenhum arquivo selecionado';
        arquivoSelecionado = null;
        document.getElementById('inp-arquivo').value = '';
        document.getElementById('btn-confirmar-import').disabled = false;

        setTimeout(function () { status.textContent = ''; }, 3000);
      }).catch(function (err) {
        status.style.color = '#ff4d4d';
        status.textContent = '❌ Erro ao salvar: ' + err;
        document.getElementById('btn-confirmar-import').disabled = false;
      });
    };
    reader.onerror = function () {
      status.style.color = '#ff4d4d';
      status.textContent = '❌ Erro ao ler arquivo.';
      document.getElementById('btn-confirmar-import').disabled = false;
    };
    reader.readAsArrayBuffer(arquivoSelecionado);
  });

  // ─── MENU HOME ────────────────────────────────────────────────────────────
  document.getElementById('home-menu').addEventListener('click', function (e) {
    var btn = e.target.closest('.menu-btn');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'continuar') {
      try {
        var ultimo = JSON.parse(localStorage.getItem(LS_ULTIMO) || '');
        if (ultimo && ultimo.id) { jogar(ultimo); return; }
      } catch (err) {}
      alert('Nenhum jogo jogado recentemente.');
    } else if (action === 'biblioteca') {
      renderizarBiblioteca();
      irPara('biblioteca');
    } else if (action === 'importar') {
      irPara('importar');
    } else if (action === 'configuracoes') {
      var sel = document.getElementById('cfg-cdn');
      sel.value = getCDN();
      irPara('config');
    }
  });

  // Navegação vertical no menu home com setas
  document.getElementById('home-menu').addEventListener('keydown', function (e) {
    var btns = Array.from(this.querySelectorAll('.menu-btn'));
    var idx  = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && idx < btns.length - 1) {
      e.preventDefault(); btns[idx + 1].focus();
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault(); btns[idx - 1].focus();
    }
  });

  // ─── BOTÕES VOLTAR ────────────────────────────────────────────────────────
  ['biblioteca', 'importar', 'config'].forEach(function (t) {
    document.getElementById('back-' + t).addEventListener('click', function () {
      irPara('home');
    });
  });

  // ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────
  document.getElementById('cfg-cdn').addEventListener('change', function () {
    setCDN(this.value);
  });

  document.getElementById('btn-limpar').addEventListener('click', function () {
    confirmar('Limpar toda a biblioteca? Isso apaga todos os jogos salvos.', function () {
      salvarBiblioteca([]);
      dbClear().catch(function () {});
      localStorage.removeItem(LS_ULTIMO);
    });
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
    if (e.key === 'Escape') {
      document.getElementById('modal-overlay').classList.add('hidden');
      modalCallback = null;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var sim = document.getElementById('modal-sim');
      var nao = document.getElementById('modal-nao');
      if (document.activeElement === sim) nao.focus();
      else sim.focus();
    }
  });

  // ─── TECLA BACKSPACE GLOBAL ───────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') {
      var tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (telaAtual !== 'home') {
        e.preventDefault();
        irPara('home');
      }
    }
  });

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  function escHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────
  abrirDB().then(function () {
    irPara('home');
    // Focar primeiro botão do menu
    var primeiro = document.querySelector('#home-menu .menu-btn');
    if (primeiro) primeiro.focus();
  }).catch(function (err) {
    console.error('Erro ao abrir banco de dados:', err);
    irPara('home');
    var primeiro = document.querySelector('#home-menu .menu-btn');
    if (primeiro) primeiro.focus();
  });

})();
