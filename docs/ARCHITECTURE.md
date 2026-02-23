# Arquitetura alvo e plano de migração – Ferrazcon Time Clock SaaS

Evolução do sistema de ponto com reconhecimento facial para um **SaaS multi-tenant** para clientes da Ferrazcon, com folha de ponto, importação inteligente, jobs assíncronos, exportação e deploy em AWS, sem quebrar o que já existe.

## 1. Visão geral da arquitetura alvo

- **Multi-tenant:** entidade Empresa (tenant); isolamento rigoroso de dados (colaboradores, batidas, folha, importações) por empresa; usuários do sistema (login backend) com papéis ADMIN/GESTOR/ATENDENTE/BALCAO e vínculo opcional a uma empresa.
- **Persistência de folha:** modelo de Consolidação Mensal (colunas definidas), alimentado por batidas e/ou importação, com revisão pelo gestor.
- **Importação inteligente:** upload de PDF, imagem, XLSX ou CSV; pipeline com OCR (quando aplicável), IA para normalizar dados, validação com Zod e revisão/aprovação pelo gestor antes de virar folha.
- **IA com saída estruturada:** respostas em JSON validado (Zod) para normalização de textos de folha e consistência.
- **Jobs assíncronos:** BullMQ + Redis para importação, consolidação, exportação e integração Google Sheets (retentativas, não bloquear resposta do reconhecimento).
- **Exportação:** JSON/CSV e opcionalmente Google Sheets (por empresa/planilha configurável).
- **Deploy AWS:** containers (ECS/Fargate ou EKS), S3 (arquivos de importação e exportação), RDS (Postgres), ElastiCache (Redis); HTTPS e variáveis sensíveis em Secrets Manager/SSM.
- **LGPD:** controle de acesso por tenant e papel, auditoria (AuditLog) de acessos e alterações, exclusão de dados do titular (colaborador/usuário) com remoção em cascata e documentação.

A arquitetura em camadas abaixo mantém o frontend (Totem + Admin) e o backend Fastify como núcleo, e adiciona camadas de tenant, folha, importação, workers e integrações.

## 2. Camadas da aplicação

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React)                                                 │
│  Totem | Admin | Gestor (folha, importação, aprovações) | Atendente     │
└─────────────────────────────────────────────────────────────────────────┘
                    │ HTTPS (JWT/session por tenant)
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API (Fastify) – rotas por módulo                                        │
│  auth | empresas | users | employees | recognitions | time-entries |     │
│  folha (consolidação) | importacao (upload, revisão) | exportacao | jobs │
└─────────────────────────────────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│ Prisma  │   │ Redis     │   │ S3        │   │ IA/OCR    │
│ (RDS)   │   │ BullMQ    │   │ (upload/  │   │ (opcional)│
│         │   │ (filas)   │   │  export)  │   │           │
└─────────┘   └───────────┘   └───────────┘   └───────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Workers (BullMQ) – importação, consolidação, export, Google Sheets      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** Totem e Admin atuais preservados; novas telas para Gestor (folha, importação, revisão) e Atendente (consultas/ajustes limitados). Login unificado com backend (JWT ou sessão), com `empresaId` e papel para escopo e permissões.
- **API:** autenticação (login, JWT/session), middleware de tenant (extrair empresa do usuário ou contexto) e de autorização (RBAC). Rotas existentes (employees, recognitions, time-entries) passam a filtrar por `empresaId`; novas rotas para folha, importação, exportação e enfileiramento de jobs.
- **Banco (RDS/Postgres):** Prisma com novos modelos (Empresa, User, ConsolidacaoMensal, Importacao, etc.) e colunas `empresaId` onde fizer sentido; migrations incrementais.
- **Redis/BullMQ:** filas para processar importação (OCR + IA), consolidação mensal, exportação e append para Google Sheets, permitindo retry e não bloqueando o reconhecimento.
- **S3:** armazenar arquivos de upload (importação) e arquivos gerados (exportação CSV/JSON) por tenant.
- **IA/OCR:** serviço opcional (interno ou integrado) para normalizar texto de folha; saída em JSON validado com Zod.

## 3. Modelo de dados (extensões Prisma)

- **Empresa:** id, nome, slug (unique), active, configuracoes (Json opcional: timezone, formato exportação, etc.), createdAt, updatedAt.
- **User:** id, email, passwordHash, role (ADMIN | GESTOR | ATENDENTE | BALCAO), empresaId (FK opcional; null para ADMIN global), active, createdAt, updatedAt.
- **Employee:** acrescentar `empresaId` (FK obrigatória). Manter identifier como unique **por empresa** (identifier + empresaId unique).
- **FaceEmbedding:** sem mudança direta; isolamento via Employee.empresaId.
- **TimeEntry:** sem mudança de estrutura; isolamento via Employee.empresaId.
- **Device:** acrescentar `empresaId` (FK); totem vinculado a uma empresa.
- **ConsolidacaoMensal (folha):** id, empresaId, employeeId, ano, mes, dados (Json com colunas definidas: totais, horas, eventos, etc.), status (RASCUNHO | REVISADO | FECHADO), revisadoPor (User id), revisadoEm, createdAt, updatedAt. Índices (empresaId, ano, mes), (employeeId, ano, mes).
- **Importacao:** id, empresaId, tipo (PDF | IMAGEM | XLSX | CSV), arquivoUrl (S3 ou path), status (PENDENTE | PROCESSANDO | REVISAO | APROVADO | ERRO), payloadBruto (Json), payloadNormalizado (Json, após OCR/IA), validacao (Json, erros Zod), criadoPor (User id), revisadoPor, revisadoEm, createdAt, updatedAt.
- **AuditLog:** acrescentar empresaId (opcional) e userId para rastreio por tenant e ator.

Regras de negócio: listagens e criações de Employee, TimeEntry, ConsolidacaoMensal e Importacao sempre filtradas/escopadas por empresaId do usuário (ou empresa selecionada para ADMIN). Reconhecimento no totem usa Device.empresaId para escopar colaboradores e batidas.

## 4. Autenticação e autorização

- **Login:** POST /api/auth/login (email, senha) → validação, geração de JWT (ou sessão) contendo userId, empresaId (se houver), role. Refresh token opcional.
- **Middleware de tenant:** em rotas que precisam de empresa, extrair empresaId do token (ou do User.empresaId). Para ADMIN sem empresa, permitir header ou query `X-Empresa-Id` em operações que afetam um tenant específico.
- **RBAC:** ADMIN (acesso global e por empresa), GESTOR (folha, importação, aprovação, relatórios da sua empresa), ATENDENTE (consultas, ajustes limitados na sua empresa), BALCAO (equivalente ao atual “totem” ou apenas leitura, conforme regra). Proteger todas as rotas de employees, time-entries, folha, importação e exportação com checagem de papel e empresa.
- **Totem:** manter `X-Device-Token`; validar Device por token e usar Device.empresaId para restringir reconhecimento aos colaboradores daquela empresa.

## 5. Fluxos novos (resumo)

- **Folha (consolidação mensal):** job ou rota que agrega TimeEntries do mês por colaborador e gera/atualiza linhas em ConsolidacaoMensal; gestor visualiza e pode marcar como REVISADO/FECHADO.
- **Importação inteligente:** upload de arquivo → armazenar em S3 → enfileirar job (OCR se PDF/imagem, IA para normalizar, Zod para validar) → resultado em Importacao.payloadNormalizado e status REVISAO; gestor abre tela de revisão, corrige se necessário e aprova → dados entram na folha ou em TimeEntry conforme regra.
- **Exportação:** gestor solicita export (JSON/CSV ou Google Sheets); job BullMQ gera arquivo (ou escreve na planilha), salva em S3 se for arquivo e retorna link ou notificação.
- **Google Sheets:** mover append atual para job BullMQ (após criar TimeEntry, enfileirar); configurar planilha/aba por empresa (tabela Empresa ou Configuracao por tenant).

## 6. LGPD

- Controle de acesso: apenas usuários autorizados por tenant e papel acessam dados da empresa.
- Auditoria: manter e estender AuditLog (ação, empresaId, userId, payload) para login, alterações de folha, importação e exportação.
- Portabilidade: endpoint de exportação de dados do colaborador (já existe; garantir escopo por empresa).
- Exclusão: DELETE do colaborador (e dados relacionados) já em cascata; incluir exclusão de usuário do sistema e anonimização ou remoção em logs quando aplicável; documentar no README e em termos de uso.

## 7. Deploy AWS (visão)

- **Containers:** API e Workers em ECS (Fargate) ou EKS; frontend servido por S3 + CloudFront ou container NGINX.
- **RDS:** Postgres para Prisma; migrations no pipeline de deploy.
- **ElastiCache:** Redis para BullMQ.
- **S3:** buckets por ambiente (dev/staging/prod); prefixos ou buckets separados por tenant para uploads e exports, com política de acesso restrita à API e aos workers.
- **Secrets/Config:** NEXTAUTH_SECRET (ou JWT_SECRET), DATABASE_URL, REDIS_URL, credenciais Google, chaves S3, etc. em Secrets Manager ou SSM Parameter Store.
- **HTTPS:** já em uso com Traefik; na AWS, ALB/Ingress com certificado ACM.

## 8. Plano de migração (etapas sem quebrar o atual)

1. **Multi-tenant e auth (base)**  
   - Adicionar Empresa e User ao schema; migration.  
   - Implementar login (JWT) e middleware de tenant/role.  
   - Adicionar `empresaId` em Employee e Device; migration e seed de uma empresa “Ferrazcon” e usuário admin; backfill de employees existentes para essa empresa.  
   - Escopar rotas de employees e time-entries por empresaId; reconhecimento por Device.empresaId.  
   - Frontend: tela de login, enviar token nas requisições, manter Totem e Admin funcionando para o único tenant.

2. **Persistência de folha**  
   - Criar modelo ConsolidacaoMensal e rotas (listar por empresa/mês, criar/atualizar rascunho, marcar revisado/fechado).  
   - Job ou rota que consolida TimeEntries do mês e preenche ConsolidacaoMensal (colunas definidas).  
   - Tela no painel do gestor para visualizar e revisar folha.

3. **Importação inteligente**  
   - Modelo Importacao e upload para S3; rota de upload e listagem por empresa.  
   - Worker BullMQ: OCR (ex.: texto de PDF/imagem), chamada IA para normalizar (JSON estruturado + Zod), gravar resultado em Importacao e status REVISAO.  
   - Tela de revisão para o gestor corrigir e aprovar; ao aprovar, popular folha ou TimeEntries conforme regra.

4. **Jobs e integrações**  
   - Redis + BullMQ: mover append Google Sheets para job; filas para consolidação, importação e exportação.  
   - Exportação JSON/CSV (e opcional Google Sheets) por empresa; arquivos em S3 e link para download.

5. **Deploy e LGPD**  
   - Dockerfiles e compose para API + Workers + Redis; documentar variáveis.  
   - Preparar para AWS (RDS, ElastiCache, S3, ECS/EKS); documentar checklist de deploy.  
   - Revisar auditoria (AuditLog) e fluxos de exclusão/exportação; atualizar README com LGPD e termos.

Cada etapa deve ser entregue em commits lógicos e testável sem desativar o fluxo atual de ponto por reconhecimento facial nem o uso atual do Admin/Totem para a empresa padrão.
