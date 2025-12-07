# Ferrazcon Time Clock (MVP)

Sistema de ponto eletrônico com reconhecimento facial pensado para rodar em tablet/totem. O projeto está dividido em duas partes:

- **Frontend (Vite + React + TypeScript)** – UI do modo totem e painel admin.
- **Backend (Fastify + Prisma + SQLite)** – APIs para colaboradores, biometrias, registros de ponto e integração opcional com Google Sheets.

Os modelos de reconhecimento facial (`@vladmandic/face-api`) já estão versionados em `public/models` para funcionar offline.

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

### Rodando localmente

Em dois terminais:

```bash
# Terminal 1 - backend
cd server
npm run dev

# Terminal 2 - frontend
cd ferrazcon-time-clock   # pasta raiz
npm run dev
```

Acesse `http://localhost:5173/totem` para o modo Totem e `http://localhost:5173/admin` para o painel.

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

Para deploy em VPS/Portainer, crie um novo stack e cole o conteúdo do `docker-compose.yml`. Preencha as variáveis sensíveis (`DEVICE_TOKEN`, credenciais do Google, `FACIAL_THRESHOLD`, etc.) e publique. Para múltiplos totens, replique o serviço `frontend` ou distribua tokens diferentes por dispositivo e mantenha o mesmo backend.

### Scripts backend

```
cd server
npm run dev          # Fastify + Prisma em modo watch
npm run prisma:migrate   # cria/aplica migrations
npm run build && npm start
```

## Fluxos implementados

### 1. Cadastro/Admin (`/admin`)
- Cadastro de colaborador (ID interno, nome, e-mail).
- Captura facial usando a própria câmera do navegador (CameraModal).
- Gera embedding localmente com `face-api` e envia para `/api/employees/:id/enrollments`.
- Lista colaboradores, mostra quantas biometrias cada um possui, permite exclusão.
- Painel com últimas batidas registradas.
- Acesso protegido: use o e-mail `contabilidadefzc@gmail.com` e a senha `Fe#@rAz65co*&n0Con1!$tabil`.

### 2. Totem (`/totem`)
- Câmera frontal espelhada com instruções ao colaborador.
- Loop automático: a cada ~3s gera embedding via `face-api` e chama `/api/recognitions` com header `X-Device-Token`.
- Backend calcula similaridade (cosine) com embeddings cadastrados e determina o próximo tipo de batida disponível.
- Registro gravado em SQLite (`timeEntries`) com confiança, dispositivo e timestamp no fuso configurado.
- Feedback visual imediato + tabela com batidas do dia.

### 3. Backend
- Fastify + Prisma (SQLite de desenvolvimento, pronto para Postgres no futuro).
- Modelos principais: `Employee`, `FaceEmbedding`, `TimeEntry`, `Device`, `AuditLog`.
- Sequência de batidas controlada no servidor (Entrada → Saída almoço → Volta almoço → Saída final).
- Logs de sucesso/erro gravados em `audit_logs` para rastreabilidade LGPD.
- Integração com Google Sheets via Service Account (`services/googleSheetsService.ts`). Basta setar `ENABLE_SHEETS=true` e preencher as variáveis.

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

- Apenas embeddings são persistidos; fotos ficam no dispositivo e não são enviadas.
- Endpoint `/api/employees/:id/export` retorna todos os dados do colaborador (para portabilidade).
- Endpoint `/api/employees/:id` com `DELETE` remove colaborador + biometria + registros (via cascade).
- Token simples de dispositivo (`DEVICE_TOKEN`) protege `/api/recognitions`. Pode ser evoluído para JWT/apikey multi-totem.
- Configurações sensíveis somente via variáveis de ambiente.

## Próximos passos sugeridos

- Adicionar liveness check (MediaPipe ou integração futura com serviço especializado).
- Suporte a múltiplos totens (tabela `Device` + gerenciamento no painel).
- Docker/Compose + Portainer stack (API, frontend, banco) para deploy na VPS.
- Mecanismo de fila para replays/retentativas da integração Google Sheets.
- Exportar relatórios (CSV/PDF) e filtros avançados no painel admin.

Com isso é possível demonstrar um MVP funcional localmente para o cliente, inclusive com reconhecimento real e armazenamento de batidas.
