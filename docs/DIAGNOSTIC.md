# Diagnóstico – Ferrazcon Time Clock

Documento de análise do código atual do sistema de ponto com reconhecimento facial, para embasar a evolução para SaaS multi-tenant e folha de ponto.

## 1. Stack e estrutura

### 1.1 Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Vite + React 18 + TypeScript |
| Estado/API | TanStack Query, fetch via `apiClient` |
| UI | shadcn/ui (Radix), TailwindCSS |
| Reconhecimento facial | `@vladmandic/face-api` (SSD MobileNet, 68 landmarks, FaceRecognitionNet) |
| Backend | Fastify + TypeScript |
| ORM | Prisma |
| Banco | SQLite (dev) – adapter LibSQL/Turso opcional via `DATABASE_URL` |
| Planilha | Google Sheets (googleapis), opcional via `ENABLE_SHEETS` |
| Deploy | Docker (multi-stage), NGINX proxy, Traefik/HTTPS em produção (`ponto.fzccontabilidade.com.br`) |

### 1.2 Estrutura de pastas

```
ferrazcon-time-clock/
├── src/                    # Frontend (Vite)
│   ├── components/         # UI (Header, CameraModal, DigitalClock, PhotoPreviewModal, ui/)
│   ├── hooks/              # useRecognitionLoop, use-toast, use-mobile
│   ├── lib/                # faceApi (loadFaceModels, getEmbeddingFromCanvas), utils
│   ├── pages/              # Totem, Admin, NotFound
│   ├── services/           # apiClient, employeeService, recognitionService, timeEntryService
│   └── types/              # timeClock (RECORD_TYPE_LABELS, etc.)
├── public/models/          # Modelos face-api (ssd_mobilenetv1, face_landmark_68, face_recognition)
├── server/
│   ├── prisma/
│   │   └── schema.prisma   # Modelos atuais
│   └── src/
│       ├── config/         # env.ts (Zod)
│       ├── lib/             # prisma, similarity (cosine), time-entry-logic, dayjs (TZ)
│       ├── modules/
│       │   ├── employees/   # employee.routes.ts
│       │   ├── recognition/ # recognition.routes.ts (POST /api/recognitions)
│       │   └── time-entries/# timeEntry.routes.ts
│       └── services/       # googleSheetsService
├── deploy/                 # nginx.conf
├── Dockerfile.frontend
└── docker-compose.yml
```

## 2. Modelo de dados atual (Prisma)

- **Employee**: id, identifier (unique), name, email (optional, unique), active, timestamps. Sem vínculo com “empresa”.
- **FaceEmbedding**: employeeId (FK), embedding (Json), algorithm, version, sourcePhotoUrl. Cascade delete com Employee.
- **TimeEntry**: employeeId (FK), type (enum ENTRADA | SAIDA_ALMOCO | VOLTA_ALMOCO | SAIDA_FINAL), timestamp, confidence, deviceId, photoUrl. Índice (employeeId, timestamp).
- **Device**: id, name, secret, location, active. Não utilizado nas rotas atuais; pensado para multi-totem.
- **AuditLog**: action, actor, payload (Json), createdAt. Usado para RECOGNITION_SUCCESS, RECOGNITION_FAILED, RECOGNITION_AMBIGUOUS.

Não há conceito de tenant (empresa), usuário de sistema (login backend) nem papéis (ADMIN/GESTOR/ATENDENTE/BALCAO). Não existe modelo de folha de ponto nem consolidação mensal.

## 3. Autenticação e autorização

- **Admin (painel):** apenas no frontend. Credenciais fixas no código (`Admin.tsx`: email/senha) e flag em `localStorage` (`fzc-admin-auth`). Nenhuma verificação no backend: qualquer um que conheça a URL da API pode chamar `GET /api/employees`, `POST /api/employees`, etc.
- **Totem:** header `X-Device-Token` validado em `POST /api/recognitions`; valor comparado com `DEVICE_TOKEN` do `.env`. Único mecanismo de “autorização” no backend.
- **Conclusão:** não há sessão/JWT, nem RBAC, nem isolamento por empresa. Esses pontos precisarão ser introduzidos na evolução para SaaS.

## 4. Fluxos principais

### 4.1 Cadastro (Admin)

1. Usuário acessa `/admin`, faz “login” (email/senha no front, armazenado em localStorage).
2. Carrega colaboradores via `GET /api/employees`.
3. Cria colaborador: `POST /api/employees` (identifier, name, email).
4. Abre `CameraModal`, captura rosto, gera embedding com `face-api` no cliente e envia `POST /api/employees/:id/enrollments` (embeddings[]).
5. Pode excluir colaborador: `DELETE /api/employees/:id` (cascade em embeddings e timeEntries) ou apenas biometria: `DELETE /api/employees/:id/enrollments`.
6. Exportação de dados do colaborador: `GET /api/employees/:id/export` (LGPD/portabilidade).

### 4.2 Totem (batida)

1. Página `/totem` carrega modelos face-api de `public/models`.
2. `useRecognitionLoop` a cada ~3s captura frame, gera embedding e chama `POST /api/recognitions` com header `X-Device-Token` e body `{ embedding, deviceId?, photoUrl?, previewOnly? }`.
3. Backend compara embedding com todos os `FaceEmbedding` (cosine similarity), aplica threshold (`FACIAL_THRESHOLD`, mínimo 0.90), trata ambiguidade (múltiplos colaboradores próximos) e determina o próximo tipo de batida do dia (`time-entry-logic`: ENTRADA → SAIDA_ALMOCO → VOLTA_ALMOCO → SAIDA_FINAL).
4. Se reconhecido e com próximo tipo definido: cria `TimeEntry`, grava `AuditLog`, opcionalmente envia linha para Google Sheets.
5. Frontend exibe feedback (nome, tipo de batida, últimas batidas do dia).

### 4.3 Time entries

- `GET /api/time-entries/today`: batidas do dia (início/fim do dia conforme `TZ`).
- `GET /api/time-entries/recent?limit=`: últimas N batidas (até 200).
- `POST /api/time-entries/manual`: criação manual (employeeId, type, timestamp?, deviceId?) – sem checagem de permissão nem tenant.

## 5. Integrações

- **Google Sheets:** `googleSheetsService`: append de uma linha (employeeId, employeeName, type, timestamp, deviceId) na aba configurada. Chamado de forma síncrona após criar `TimeEntry`; falha só é logada, não bloqueia a resposta. Sem fila de retentativas.
- **Nenhum** Redis, BullMQ, S3, OCR ou IA no código atual.

## 6. Pontos frágeis e aproveitáveis

### Frágeis

- Auth do admin apenas no frontend (credenciais no código, localStorage); APIs do backend sem proteção por tenant nem por papel.
- Um único “tenant” implícito: todos os colaboradores e batidas no mesmo banco, sem isolamento.
- Google Sheets síncrono; sem retry nem fila em caso de falha.
- Sem modelo de folha/consolidação mensal; apenas `TimeEntry` bruto.
- Sem importação de folha (PDF/planilha/OCR/IA).
- Sem exportação estruturada (JSON/CSV) nem jobs assíncronos.
- SQLite em dev; produção pode usar Turso; não há documentação de migração para Postgres/RDS nem uso de Redis/ElastiCache.

### Aproveitáveis

- Prisma e Fastify bem organizados por módulos (employees, recognition, time-entries); fácil estender com rotas de folha, importação e exportação.
- Pipeline de reconhecimento (embedding no cliente, comparação no servidor, threshold e ambiguidade) estável e auditado; manter e apenas escopar por empresa.
- Lógica de sequência de batidas (`time-entry-logic`) clara e baseada em TZ; reutilizável por tenant.
- LGPD já considerada: apenas embeddings (não fotos) persistidos; export e delete do colaborador existem; AuditLog para reconhecimento.
- Frontend Totem/Admin separados; fácil adicionar rotas e telas (ex.: gestor, importação, relatórios) sem quebrar o fluxo atual.
- Docker e proxy já em uso; base para evoluir para containers na AWS (ECS/EKS), S3, RDS e ElastiCache.

## 7. Resumo

O sistema hoje é um **MVP single-tenant**: um único “escritório” (Ferrazcon), ponto por reconhecimento facial, batidas em SQLite e opção de espelhamento em Google Sheets. Não há multi-tenant, folha consolidada, importação inteligente, jobs em background, exportação configurável nem auth/autorização no backend. O diagnóstico acima serve de base para a proposta de arquitetura e plano de migração no documento `ARCHITECTURE.md`.
