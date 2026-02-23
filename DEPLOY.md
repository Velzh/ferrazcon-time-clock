# Deploy na VPS – Gestão de ponto (Ferrazcon)

Passo a passo para subir a **nova versão** do app na VPS, no mesmo padrão da v1 (Docker + Traefik/HTTPS em `ponto.fzccontabilidade.com.br`).

---

## 1. Na sua máquina (preparar a nova versão)

1. **Commit e push** das alterações (se ainda não fez):
   ```bash
   cd ferrazcon-time-clock
   git add .
   git commit -m "v2: multi-tenant, folha, importação, Gestão de ponto"
   git push origin main
   ```

2. **(Opcional)** Testar o build Docker localmente:
   ```bash
   cp env.example .env.docker
   # Edite .env.docker: VITE_API_URL=/api, DEVICE_TOKEN=..., JWT_SECRET=...
   docker compose --env-file .env.docker up --build
   ```
   Acesse `http://localhost:8080` e confira login/totem. Depois `docker compose down`.

---

## 2. Na VPS (acesso SSH)

3. **Conectar na VPS**:
   ```bash
   ssh usuario@ip-da-vps
   # ou
   ssh usuario@ponto.fzccontabilidade.com.br
   ```

4. **Ir até a pasta do projeto** (onde está o repositório clonado na v1):
   ```bash
   cd /caminho/para/ferrazcon-time-clock
   # Exemplo: cd ~/ferrazcon-time-clock ou cd /opt/ferrazcon-time-clock
   ```

5. **Atualizar o código**:
   ```bash
   git fetch origin
   git pull origin main
   ```

---

## 3. Variáveis de ambiente na VPS

6. **Arquivo de ambiente** usado pelo Docker (ex.: `.env` na pasta do projeto):
   - Se na v1 você usava um arquivo (ex.: `.env`), **mantenha** as variáveis que já existiam.
   - **Inclua ou ajuste** estas para a nova versão:

   | Variável | Obrigatório | Descrição |
   |----------|-------------|-----------|
   | `JWT_SECRET` | **Sim** | Chave forte (32+ caracteres) para tokens de login. **Defina em produção.** |
   | `DEVICE_TOKEN` | Sim | Mesmo valor que o totem usa no header `X-Device-Token`. |
   | `DATABASE_URL` | Sim | Na VPS com Docker: `file:./data/dev.db` (volume persiste). |
   | `VITE_API_URL` | Sim (build) | Para o frontend: use `/api` (proxy no nginx). |
   | `UPLOAD_DIR` | Não | Default no compose: `/app/data/uploads`. |
   | `OPENAI_API_KEY` | Não | Só se quiser normalização por IA na importação de folha. |

   Exemplo mínimo em `.env` na raiz do projeto:
   ```env
   VITE_API_URL=/api
   DEVICE_TOKEN=seu-token-seguro
   JWT_SECRET=sua-chave-jwt-muito-segura-min-32-chars
   TZ=America/Sao_Paulo
   ```

7. **Não commitar** o `.env` (ele deve estar no `.gitignore`). Se a VPS não tiver o arquivo, crie a partir do `env.example` na raiz e de `server/env.example` para o backend.

---

## 4. Build e subida dos containers

8. **Parar a stack atual** (v1):
   ```bash
   docker compose down
   ```

9. **Build e subir a nova versão**:
   ```bash
   docker compose --env-file .env up -d --build
   ```
   (Use o nome do seu arquivo de env se for outro, ex.: `--env-file .env.docker`.)

10. **Verificar** se os dois serviços subiram:
    ```bash
    docker compose ps
    ```
    Deve aparecer `api` e `frontend` com status "Up".

11. **Migrations**: o `docker-compose` já roda `npx prisma migrate deploy` no startup do container `api`. Na primeira vez que essa VPS recebe a v2, as novas tabelas (Empresa, User, Folha, Importação, etc.) serão criadas automaticamente.

12. **Seed (só na primeira vez com a v2)**  
    Se esta é a **primeira** implantação da versão multi-tenant nessa base, você precisa rodar o seed **uma vez** para criar a empresa padrão, usuário admin e device do totem. O container não inclui o código do seed; duas opções:
    - **Opção A:** Na sua máquina, com o banco da VPS acessível (ex.: cópia do volume), rode `cd server && npm run prisma:seed`.
    - **Opção B:** Na VPS, após o primeiro `up`, copie o script de seed para dentro do container e execute, ou use um job único (ex.: script que chama a API de criação de empresa/usuário).

    Credenciais criadas pelo seed (troque em produção):  
    - Admin: `admin@ferrazcon.com.br` / `Ferrazcon@Admin2025!`  
    - Gestor Ferrazcon: `gestor@ferrazcon.com.br` / `Gestor@Ferrazcon2025!`  
    - Gestor Velz Hub: `gestor@velzhub.com.br` / `VelzHub@Gestor2025!`

---

## 5. Traefik / HTTPS (se já usava na v1)

13. Se na v1 o acesso era por **Traefik** com HTTPS em `ponto.fzccontabilidade.com.br`, mantenha a mesma configuração:
    - O serviço **frontend** expõe a porta 80 (ou a que estiver em `WEB_PORT`).
    - No Traefik, a rota deve apontar para o container do frontend; o proxy interno já envia `/api` para o container `api` (conforme `deploy/nginx.conf`).
    - Nenhuma alteração obrigatória no Traefik para a v2, desde que o stack use a mesma rede/nomes de serviço.

14. Teste no navegador:
    - `https://ponto.fzccontabilidade.com.br` → deve abrir o app.
    - `/login` → login com um dos usuários do seed (após rodar o seed).
    - `/totem` → modo totem (header `X-Device-Token` = `DEVICE_TOKEN` do `.env`).

---

## Resumo rápido

```bash
# Na sua máquina
git push origin main

# Na VPS
cd /caminho/ferrazcon-time-clock
git pull origin main
# Editar .env e adicionar JWT_SECRET (e demais se necessário)
docker compose down
docker compose --env-file .env up -d --build
docker compose ps
# Se primeira vez v2: rodar seed (ver passo 12)
```

Se algo falhar, confira os logs: `docker compose logs -f api` e `docker compose logs -f frontend`.
