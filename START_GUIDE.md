# 🚀 Guia de Inicialização - Minha Plataforma

## Scripts Disponíveis

### 🪟 Windows
```cmd
start.bat
```
**Duplo clique no arquivo** ou execute no cmd/PowerShell

### 🐧 Linux/Mac
```bash
./start.sh
```
Funciona em bash, zsh, fish (chamando direto). Verifica Node/NPM, sobe backend e frontend, faz cleanup dos dois ao receber Ctrl+C.

## 📋 Pré-requisitos

- **Node.js** (v16 ou superior)
- **NPM** (incluído com Node.js)

## 🔧 Primeiro Uso

1. **Instalar dependências:**
   ```bash
   npm install
   ```

2. **Executar o script apropriado:**
   - Windows: `start.bat`
   - Linux/Mac: `./start.sh`

## 🌐 Acesso

Após executar o script:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001
- **Configurações:** Botão no topo direita da página inicial

## ⚙️ Configuração de Cursos

1. Abra o frontend
2. Clique em "Configurações" (topo direita)
3. Altere o caminho dos cursos
4. Clique em "Salvar"

## 🛑 Parar os Serviços

- **Windows:** Pressione `Ctrl+C` na janela do cmd
- **Linux/Mac:** Pressione `Ctrl+C` no terminal (o trap cuida de matar backend e frontend juntos)

## 🆘 Problemas Comuns

### Node.js não encontrado
- Instale: https://nodejs.org
- Reinicie o terminal

### Porta em uso
- Pare outros serviços nas portas 3001 e 5173
- Ou altere as portas nos arquivos de configuração

### Permissão negada (Linux/Mac)
```bash
chmod +x start.sh
```
