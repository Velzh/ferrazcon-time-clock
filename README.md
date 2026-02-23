# Ferrazcon Time Clock (SaaS Multi-tenant)

Sistema de ponto eletrônico com reconhecimento facial para rodar em tablet/totem, evoluído para **SaaS multi-empresa** (multi-tenant) para clientes da Ferrazcon.

- **Frontend (Vite + React + TypeScript)** – Totem, painel admin e login (JWT).
- **Backend (Fastify + Prisma + SQLite)** – APIs com isolamento por empresa, auth (JWT), colaboradores, biometrias, ponto, folha consolidada e integração opcional com Google Sheets.

Os modelos de reconhecimento facial (`@vladmandic/face-api`) estão em `public/models` para uso offline.

## Requisitos

- Node.js 18+
- npm 9+
- Câmera compatível com o navegador (para teste local)

## Setup rápido

```bash
# 1. Instale dependências do frontend
git clone https://github.com/Velzh/ferrazcon-time-clock.git
cd ferrazcon-time-clock
npm install

# 2. Instale dependências do backend
cd server
npm install
```

Crie os arquivos de ambiente (os exemplos já estão versionados):

```bash
# frontend
cp env.example .env.local
# server
cp server/env.example server/.env
```

Variáveis importantes do **frontend**:

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL da API (ex.: `http://localhost:4000` em dev ou `/api` no build Docker) |
| `VITE_DEVICE_TOKEN` | Token que o totem envia no header `X-Device-Token` |

Variáveis importantes do **backend** (`server/.env`):

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Conexão Prisma (padrão `file:./dev.db` - SQLite) |
| `PORT` | Porta do servidor (default 4000) |
| `TZ` | Fuso horário utilizado (`America/Sao_Paulo`) |
| `FACIAL_THRESHOLD` | Similaridade mínima (0–1) para considerar o reconhecimento válido |
| `DEVICE_TOKEN` | Deve bater com `VITE_DEVICE_TOKEN` do front |
| `ENABLE_SHEETS` | `true/false` para ativar Google Sheets |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email da service account |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON da key (pode ser base64) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID da planilha |
| `GOOGLE_SHEETS_TAB` | Aba usada para append |
| `JWT_SECRET` | Chave para assinatura do token (mín. 16 caracteres; em produção use 32+) |

### Rodando localmente

1. **Banco e seed (primeira vez ou após migrations)**

```bash
cd server
npm run prisma:migrate   # aplica migrations
npm run prisma:seed      # cria empresa padrão, usuário ADMIN e device do totem
```

2. **Em dois terminais**

```bash
# Terminal 1 - backend
cd server
npm run dev

# Terminal 2 - frontend (pasta raiz)
npm run dev
```

- **Totem:** `http://localhost:5173/totem` (header `X-Device-Token` = `DEVICE_TOKEN` do `.env`).
- **Admin:** `http://localhost:5173/admin` → redireciona para login se não autenticado.
- **Login:** `http://localhost:5173/login`. Após o seed:
  - **ADMIN (Ferrazcon):** `admin@ferrazcon.com.br` / `Ferrazcon@Admin2025!` — vê seletor de empresas em `/admin`.
  - **GESTOR Ferrazcon:** `gestor@ferrazcon.com.br` / `Gestor@Ferrazcon2025!` — painel da empresa Ferrazcon.
  - **GESTOR Velz Hub:** `gestor@velzhub.com.br` / `VelzHub@Gestor2025!` — painel da empresa Velz Hub (cliente exemplo).
  Gestores acessam o mesmo `/admin`; não há seletor de empresa, apenas os dados da própria empresa.

### Executando com Docker / Portainer

Artefatos incluídos:

- `server/Dockerfile`: API Fastify + Prisma (multi-stage, roda migrations automaticamente).
- `Dockerfile.frontend`: build Vite + entrega via NGINX com proxy reverso para `/api`.
- `docker-compose.yml`: orquestração pronta para Docker Desktop ou Portainer.

Como rodar localmente:

```bash
# ajuste as variáveis conforme necessário
cp env.example .env.docker   # personalize VITE_API_URL/DEVICE_TOKEN se quiser
cp server/env.example server/.env

# sobe frontend + backend
docker compose --env-file .env.docker up --build
```

Padrões do compose:

- API exposta em `http://localhost:4000` (`API_PORT`).
- Frontend em `http://localhost:8080` (`WEB_PORT`) com proxy automático para `/api`.
- Banco SQLite persistido no volume `api_data` (`/app/data/dev.db` dentro do container).

Para deploy em VPS/Portainer, crie um novo stack e cole o conteúdo do `docker-compose.yml`. Preencha as variáveis sensíveis (`DEVICE_TOKEN`, `JWT_SECRET`, credenciais do Google, `FACIAL_THRESHOLD`, etc.) e publique. **Passo a passo completo (atualizar código, env, build, seed, Traefik):** veja **[DEPLOY.md](DEPLOY.md)**. Para múltiplos totens, replique o serviço `frontend` ou distribua tokens diferentes por dispositivo e mantenha o mesmo backend.

### Scripts backend

```
cd server
npm run dev              # Fastify + Prisma em modo watch
npm run prisma:migrate   # cria/aplica migrations
npm run prisma:seed      # empresa padrão + usuário ADMIN + device totem
npm run build && npm start
```

## Multi-tenant e papéis

- **Empresa (tenant):** toda entidade sensível (colaborador, batida, folha) está vinculada a uma empresa.
- **Papéis:** `ADMIN` (Ferrazcon, gerencia todas as empresas), `GESTOR` (apenas sua empresa), `ATENDENTE` e `BALCAO` (registro e consulta mínima).
- **Auth:** login em `/api/auth/login` retorna JWT; o front envia `Authorization: Bearer <token>` e, para ADMIN, opcionalmente `X-Empresa-Id` para escopar operações.
- **Totem:** cada dispositivo (Device) pode ter um `empresaId`; o reconhecimento usa apenas colaboradores dessa empresa. O seed cria um device padrão com o `DEVICE_TOKEN` atual.

## Fluxos implementados

### 1. Login e Admin (`/login`, `/admin`)
- Login com e-mail e senha; JWT armazenado no front; todas as chamadas à API autenticadas usam o token.
- ADMIN escolhe a empresa no seletor; GESTOR usa apenas a própria empresa.
- Cadastro de colaborador (ID interno, nome, e-mail) escopado à empresa selecionada.
- Captura facial (CameraModal), embedding via `face-api`, envio para `/api/employees/:id/enrollments`.
- Lista de colaboradores e últimas batidas da empresa.
- **Usuário padrão (seed):** `admin@ferrazcon.com.br` / `Ferrazcon@Admin2025!`.

### 2. Totem (`/totem`)
- Câmera frontal espelhada com instruções ao colaborador.
- Loop automático: a cada ~3s gera embedding via `face-api` e chama `/api/recognitions` com header `X-Device-Token`.
- Backend calcula similaridade (cosine) com embeddings cadastrados e determina o próximo tipo de batida disponível.
- Registro gravado em SQLite (`timeEntries`) com confiança, dispositivo e timestamp no fuso configurado.
- Feedback visual imediato + tabela com batidas do dia.

### 3. Folha consolidada
- Modelo `FolhaConsolidadaMensal` com colunas padrão (COLABORADOR, HORAS 60%, HORAS 100%, NOTURNO, INTERJORNADA, DESCONTO, ALOCADO, PLANO DE SAUDE, OBSERVAÇÃO).
- `GET /api/folha?ano=&mes=` lista a folha da empresa; `PUT /api/folha` cria/atualiza linha.
- `GET /api/folha/export?ano=&mes=&format=json|csv` exporta a folha do mês (JSON ou CSV).

### 4. Backend
- Fastify + Prisma (SQLite dev; Postgres/Redis previstos para produção).
- Modelos: `Empresa`, `User`, `Employee` (com `empresaId`), `FaceEmbedding`, `TimeEntry`, `Device`, `FolhaConsolidadaMensal`, `ImportacaoArquivo`, `ImportacaoLinha`, `AuditLog`.
- Sequência de batidas no servidor (Entrada → Saída almoço → Volta almoço → Saída final).
- Auditoria em `AuditLog`; controle de acesso por role e `empresaId` em todas as rotas sensíveis.
- Google Sheets: Service Account em `services/googleSheetsService.ts`; `ENABLE_SHEETS=true` e variáveis preenchidas.

## Reconhecimento facial

- Bibliotecas: `@vladmandic/face-api` no navegador, `cosineSimilarity` no backend.
- Pipeline: detecção (SSD MobileNet) → landmarks (68 pts) → embedding (`FaceRecognitionNet`).
- Embeddings (vetores Float32) são enviados ao backend; nenhuma imagem é enviada por padrão.
- Similaridade: cosseno, threshold configurável (`FACIAL_THRESHOLD`, default 0.90 para máxima segurança).
- Proteção contra ambiguidade: rejeita reconhecimento se houver múltiplos matches próximos ao threshold.
- Validação rigorosa: embeddings são validados antes de salvar e comparar (tamanho 128-512, valores numéricos).
- Mensagens de erro claras quando o rosto não é reconhecido, incluindo percentual de similaridade.
- Os modelos `.json/.bin` estão em `public/models` para rodar offline (Tablet em modo quiosque).

### LGPD & Segurança

- Apenas embeddings são persistidos; fotos ficam no dispositivo.
- `/api/employees/:id/export` – portabilidade dos dados do colaborador.
- `DELETE /api/employees/:id` – exclusão em cascata (colaborador + biometria + registros).
- Controle de acesso: role e `empresaId` checados em todas as rotas; JWT para usuários; token de dispositivo para totem.
- Configurações sensíveis apenas em variáveis de ambiente.

## Documentação adicional

- `docs/DIAGNOSTIC.md` – diagnóstico do código atual.
- `docs/ARCHITECTURE.md` – arquitetura alvo (SaaS, folha, importação, jobs, AWS) e plano de migração.

## Importação inteligente de folha

Na aba **Importar folha** do painel (Admin/Gestor):

1. **Enviar documento:** PDF, XLSX, CSV ou imagem (PNG/JPG). Opcional: mês de referência (YYYY-MM).
2. O backend processa de forma síncrona: extrai texto (XLSX/CSV parse; PDF com pdf-parse ou OCR; imagem com Tesseract).
3. Se **OPENAI_API_KEY** estiver configurada, o texto é enviado à IA para normalizar em JSON (colaborador, horas 60%/100%, etc.) e validado com Zod. Caso contrário, usa mapeamento heurístico das colunas.
4. As linhas ficam em **Revisão**; o gestor vê a tabela em **Importações recentes** → **Ver**.
5. **Confirmar e consolidar na folha** grava os dados em `FolhaConsolidadaMensal` (por colaborador/mês). Linhas cujo nome não corresponder a um colaborador cadastrado são ignoradas.

Variáveis opcionais no backend: `UPLOAD_DIR` (pasta de uploads, default `./uploads`), `OPENAI_API_KEY` (para normalização por IA).

## Próximos passos (roadmap)

- Jobs assíncronos (BullMQ + Redis) para importação pesada e exportação em background.
- Docker com Postgres e Redis; preparação para AWS (S3, RDS, ElastiCache).
- Liveness check e gestão de dispositivos (Device) no painel.
