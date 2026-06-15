#  NexFinance - Plataforma de Gestão Financeira Inteligente

> **Status**:  Integração Supabase Completa |  Pronto para Configuração

---

##  O que é NexFinance?

NexFinance é uma plataforma SaaS de gestão financeira que centraliza dados de empresas e fornece insights com IA. Construída com:

- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Backend**: Node.js + Express
- **Banco de Dados**: Supabase (PostgreSQL)
- **Autenticação**: JWT + bcrypt
- **Segurança**: Validação, sanitização, middleware

---

##  Início Rápido

### Pré-requisitos
-  Node.js instalado
-  Projeto criado no Supabase
-  npm install já realizado

### Setup (5 minutos)

```bash
# 1. Preencha as credenciais do Supabase
# Abra: .env
# Substitua os placeholders com suas chaves do Supabase

# 2. Execute as migrations no Supabase
# Abra: https://app.supabase.com
# Vá em: SQL Editor
# Copie o arquivo: migrations.sql
# Cole e execute

# 3. Reinicie o servidor
npm start

# 4. Acesse
# Navegador: http://localhost:3000
```

**Mais detalhes?** Leia [PROXIMAS_ACOES.md](PROXIMAS_ACOES.md)

---

## 📁 Estrutura do Projeto

```
Se-ligaJovem2026/
│
├── 📖 Documentação (comece por RESUMO_IMPLEMENTACAO.md)
│   ├── RESUMO_IMPLEMENTACAO.md      ← Visão geral
│   ├── PROXIMAS_ACOES.md             ← Seu checklist
│   ├── SETUP_SUPABASE.md             ← Guia técnico
│   ├── INDICE_DOCUMENTACAO.md        ← Índice de documentos
│   ├── MUDANCAS_IMPLEMENTADAS.md     ← O que mudou
│   └── ANALISE_MUDANCAS_SERVER.md    ← Análise de código
│
├── 🔐 Configuração
│   ├── .env                          ← Preencha com suas credenciais!
│   └── .env.example                  ← Referência
│
├── 🔧 Backend
│   ├── server.js                     ← Servidor Express
│   ├── supabaseClient.js             ← Cliente Supabase
│   ├── validation.js                 ← Validação de entrada
│   ├── middleware.js                 ← Autenticação JWT
│   ├── migrations.sql                ← Schema do banco
│   └── package.json                  ← Dependências
│
├── 🎨 Frontend
│   └── public/
│       ├── index.html                ← Landing page
│       ├── login.html                ← Login
│       ├── cadastro.html             ← Cadastro
│       ├── dashboard.html            ← Dashboard
│       ├── styles.css                ← CSS global
│       ├── login.css                 ← CSS login
│       ├── dashboard.css             ← CSS dashboard
│       └── assets/                   ← Recursos compilados
│
└── 🗄️ Supabase
    └── config.toml                   ← Configuração local
```

---

## 🔐 Autenticação & Segurança

✅ **Implementado:**
- JWT com secret configurável
- Hashing de senha com bcrypt
- Validação de email e entrada
- Sanitização contra XSS
- Middleware de autenticação
- Variáveis de ambiente seguras

🎯 **Próximos:**
- Rate limiting
- Helmet.js para headers
- HTTPS em produção

---

## 📚 Documentação

| Documento | Tempo | Para Quem |
|-----------|-------|----------|
| [RESUMO_IMPLEMENTACAO.md](RESUMO_IMPLEMENTACAO.md) | 5 min | Visão geral rápida |
| [PROXIMAS_ACOES.md](PROXIMAS_ACOES.md) | 15 min | **Você! Comece aqui** |
| [SETUP_SUPABASE.md](SETUP_SUPABASE.md) | 20 min | Detalhes técnicos |
| [INDICE_DOCUMENTACAO.md](INDICE_DOCUMENTACAO.md) | 5 min | Guia de leitura |
| [MUDANCAS_IMPLEMENTADAS.md](MUDANCAS_IMPLEMENTADAS.md) | 10 min | O que mudou |
| [ANALISE_MUDANCAS_SERVER.md](ANALISE_MUDANCAS_SERVER.md) | 25 min | Análise de código |

---

## 🚀 Roteiro (Roadmap)

```
Semana 1: ✅ Setup Supabase (você está aqui)
  ├── ✅ Integração com Supabase
  ├── ✅ Autenticação funcional
  └── ✅ Banco de dados estruturado

Semana 2: Integração de Dados
  ├── Endpoints para Clientes (CRUD)
  ├── Endpoints para Fornecedores
  └── Endpoints para Produtos

Semana 3: Dashboard Real
  ├── KPIs conectados ao banco
  ├── Gráficos e relatórios
  └── Análise de dados

Semana 4: Produção
  ├── Deploy
  ├── SSL/HTTPS
  └── Monitoramento
```

---

## 🧪 Testar Localmente

### 1. Cadastro
```bash
# Navegue até: http://localhost:3000
# Clique em: "Começar agora"
# Preencha o formulário
# Dados são salvos no Supabase!
```

### 2. Login
```bash
# Vá para: http://localhost:3000/login.html
# Use o email e senha que cadastrou
# Será redirecionado para o dashboard
```

### 3. API (com curl)
```bash
# Cadastro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"João","email":"joao@test.com","password":"123456","company":"Teste"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@test.com","password":"123456"}'

# Dashboard (protegido)
curl -X GET http://localhost:3000/api/dashboard \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` com:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua_chave_anon
SUPABASE_JWT_SECRET=seu_jwt_secret

# Servidor
PORT=3000
NODE_ENV=development

# Autenticação
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Segurança
BCRYPT_ROUNDS=10
```

**Obtenha as chaves em**: https://app.supabase.com → Seu Projeto → Settings → API

---

## 🛠️ Tecnologias

- **Runtime**: Node.js
- **Web Framework**: Express.js
- **Banco de Dados**: PostgreSQL (via Supabase)
- **Autenticação**: JWT + bcrypt
- **Cliente Supabase**: @supabase/supabase-js
- **Frontend**: HTML5 + CSS3 + JavaScript

---

## 📋 Requisitos de Desenvolvimento

```json
{
  "node": "^18.0.0",
  "npm": "^9.0.0",
  "dependencies": {
    "@supabase/supabase-js": "^2.107.0",
    "express": "^4.22.2",
    "cors": "^2.8.6",
    "bcryptjs": "^3.0.3",
    "jsonwebtoken": "^9.0.3",
    "dotenv": "^16.6.1"
  }
}
```

---

## 🔍 Troubleshooting

### Erro: "Variáveis de ambiente não configuradas"
- Verifique se `.env` existe na raiz
- Confirme que SUPABASE_URL e SUPABASE_KEY estão preenchidos
- Reinicie o servidor

### Erro: "Tabelas não encontradas"
- Acesse Supabase → SQL Editor
- Copie e execute o arquivo `migrations.sql`

### Erro: "Email já cadastrado"
- Use outro email ou delete o usuário na tabela do Supabase

**Mais ajuda?** Veja [SETUP_SUPABASE.md](SETUP_SUPABASE.md#troubleshooting)

---

## 📞 Suporte

- 📖 Leia a documentação em [`INDICE_DOCUMENTACAO.md`](INDICE_DOCUMENTACAO.md)
- 🔧 Troubleshooting em [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md)
- 💻 Análise de código em [`ANALISE_MUDANCAS_SERVER.md`](ANALISE_MUDANCAS_SERVER.md)

---

## 📝 Licença

Propriatário - Se Liga Jovem 2026

---

## 🎯 Próximas Ações

> **👉 Comece por aqui:**

1. Leia: [RESUMO_IMPLEMENTACAO.md](RESUMO_IMPLEMENTACAO.md) (5 min)
2. Siga: [PROXIMAS_ACOES.md](PROXIMAS_ACOES.md) (15 min)
3. Configure: `.env` com suas credenciais
4. Execute: `migrations.sql` no Supabase
5. Reinicie: `npm start`
6. Teste: http://localhost:3000

---

**✅ Status**: Pronto para começar!  
**📅 Data**: Junho 2026  
**🔗 Projeto**: Se-ligaJovem2026 (NexFinance)

---

> Made with ❤️ by the NexFinance Team
