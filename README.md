# 📺 RetroTV

App de emulação retrô para Android TV com interface web (EmulatorJS).

---

## 📁 Estrutura do Projeto

```
retrotv/
├── frontend/               # Interface web (HTML/CSS/JS)
│   ├── index.html          # Tela principal (hub)
│   ├── style.css           # Estilos dark TV
│   ├── app.js              # Lógica da biblioteca e navegação
│   └── player.html         # Tela do emulador (EmulatorJS)
│
└── android/                # Projeto Android
    ├── app/
    │   ├── build.gradle
    │   ├── proguard-rules.pro
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       ├── java/com/retrotv/app/
    │       │   └── MainActivity.java
    │       └── res/
    │           ├── values/strings.xml
    │           ├── values/styles.xml
    │           └── xml/network_security_config.xml
    ├── build.gradle
    ├── settings.gradle
    ├── gradle.properties
    └── gradle/wrapper/gradle-wrapper.properties
```

---

## 🌐 Como Rodar o Frontend Localmente

O frontend não precisa de build — é HTML/JS puro.

### Opção 1 — VS Code + Live Server
1. Abra a pasta `retrotv/frontend/` no VS Code
2. Instale a extensão **Live Server**
3. Clique com direito em `index.html` → "Open with Live Server"
4. Acesse `http://localhost:5500`

### Opção 2 — Node.js (http-server)
```bash
npx http-server retrotv/frontend -p 8080
# Acesse: http://localhost:8080
```

### Opção 3 — Python
```bash
cd retrotv/frontend
python3 -m http.server 8080
# Acesse: http://localhost:8080
```

> ⚠️ **Importante:** o EmulatorJS precisa de conexão com internet na primeira execução
> para baixar os cores da CDN (`cdn.emulatorjs.org`). Depois fica em cache.

---

## 📱 Como Gerar o APK (Android)

### Pré-requisitos
- Android Studio **Hedgehog** (2023.1.1) ou mais recente
- **ou** JDK 17 + Android SDK via linha de comando

### Passo 1 — Copiar o Frontend para os Assets

O `build.gradle` já configura `assets.srcDirs` apontando para `../../frontend`,
então **não é preciso copiar manualmente** — o Gradle inclui automaticamente.

Se precisar copiar manualmente:
```bash
mkdir -p retrotv/android/app/src/main/assets/www
cp -r retrotv/frontend/* retrotv/android/app/src/main/assets/www/
```
E ajuste `MainActivity.java`:
```java
mWebView.loadUrl("file:///android_asset/www/index.html");
```

### Passo 2 — Adicionar Ícone (opcional)
Coloque `ic_launcher.png` em:
```
android/app/src/main/res/mipmap-hdpi/ic_launcher.png   (72x72)
android/app/src/main/res/mipmap-xhdpi/ic_launcher.png  (96x96)
android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png (144x144)
```

### Passo 3 — Gerar APK Debug (Android Studio)

1. Abra o Android Studio
2. `File → Open` → selecione a pasta `retrotv/android/`
3. Aguarde o Gradle sincronizar
4. Menu: `Build → Build Bundle(s) / APK(s) → Build APK(s)`
5. O APK estará em: `android/app/build/outputs/apk/debug/app-debug.apk`

### Passo 4 — Gerar APK Debug (linha de comando)

```bash
cd retrotv/android

# Linux/macOS
./gradlew assembleDebug

# Windows
gradlew.bat assembleDebug
```

APK gerado em: `app/build/outputs/apk/debug/app-debug.apk`

### Passo 5 — Gerar APK Release (para distribuição)

```bash
cd retrotv/android
./gradlew assembleRelease
```

> ⚠️ APK Release precisa ser **assinado** para instalar.
> No Android Studio: `Build → Generate Signed Bundle/APK`.

---

## 📺 Como Instalar na Android TV

### Via ADB (linha de comando)
```bash
# 1. Ativar depuração USB na TV (Configurações → Sobre → Developer Options)
# 2. Conectar TV e PC na mesma rede Wi-Fi
# 3. Descobrir IP da TV (Configurações → Rede)

adb connect <IP_DA_TV>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Via Pen Drive
1. Copie o APK para um pen drive
2. Use um gerenciador de arquivos na TV (ex: File Commander, X-plore)
3. Navegue até o APK e instale
4. Ative "Fontes desconhecidas" se pedido

---

## 🎮 Como Usar o App

### Tela Inicial
| Tecla | Ação |
|-------|------|
| ↑ ↓   | Navegar no menu |
| Enter | Selecionar |
| Backspace | Voltar |

### Importar Jogo
1. Selecione "Importar Jogo"
2. Digite o nome do jogo
3. Escolha o sistema (NES, SNES, GBA, etc.)
4. Selecione o arquivo ROM do seu dispositivo
5. Clique em "Adicionar à Biblioteca"

> Os jogos ficam salvos no IndexedDB do navegador/WebView.

### Jogar
1. Acesse "Biblioteca"
2. Selecione o jogo
3. Aguarde o EmulatorJS carregar (necessita internet na 1ª vez)

### Atalhos no Player
| Tecla | Ação |
|-------|------|
| ESC   | Sair para a biblioteca |
| S     | Salvar estado |
| L     | Carregar estado |
| F     | Tela cheia / Sair da tela cheia |

---

## 🕹️ Sistemas Suportados

| Sistema | Core |
|---------|------|
| NES / Famicom | `nes` |
| SNES / Super Famicom | `snes` |
| Game Boy / Color | `gb` |
| Game Boy Advance | `gba` |
| Nintendo 64 | `n64` |
| Mega Drive / Genesis | `segaMD` |
| Master System | `segaMS` |
| Game Gear | `segaGG` |
| PlayStation 1 | `psx` |
| Arcade (MAME) | `arcade` |

Extensões aceitas: `.nes .sfc .smc .gba .gb .gbc .n64 .z64 .smd .md .gen .zip`

---

## ⚙️ EmulatorJS — Notas Técnicas

O RetroTV usa [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) via CDN:
```
https://cdn.emulatorjs.org/stable/data/
```

### Para uso offline
1. Baixe o zip de release em: https://github.com/EmulatorJS/EmulatorJS/releases/latest
2. Extraia e coloque a pasta `data/` dentro de `frontend/`
3. No `player.html`, mude:
   ```javascript
   window.EJS_pathtodata = 'data/';  // pasta local
   ```

---

## ⚖️ Aviso Legal

Este projeto **não inclui jogos**. Você deve possuir legalmente as ROMs que utilizar.
O emulador é apenas uma ferramenta técnica.

---

## 📄 Licença

MIT — livre para uso, modificação e distribuição.
