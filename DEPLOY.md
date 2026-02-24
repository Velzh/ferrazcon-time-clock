# Deploy na VPS – Gestão de ponto (Ferrazcon) v2

Passo a passo completo: **subir o código no Git** e **rodar na VPS com Portainer** (imagens buildadas na VPS, stack com Traefik).

---

## Parte 1: Subir o código no Git (na sua máquina)

1. Abra o terminal na pasta do projeto e confira o status:
   ```bash
   cd ferrazcon-time-clock
   git status
   ```

2. Adicione todas as alterações e faça o commit:
   ```bash
   git add .
   git commit -m "v2: Gestão de ponto, login, admin, seed no container, nginx SPA"
   ```

3. Envie para o repositório remoto. Use a branch que você usa em produção (geralmente `main`):
   ```bash
   git push origin main
   ```
   Se sua branch for outra (ex.: `prisma-update`), use:
   ```bash
   git push origin prisma-update
   ```
   E depois, se o deploy na VPS for pela `main`, faça o merge na `main` e dê push:
   ```bash
   git checkout main
   git merge prisma-update
   git push origin main
   ```

---

## Parte 2: Na VPS – atualizar código e buildar as imagens

4. Conecte na VPS por SSH:
   ```bash
   ssh root@fzccontabilidade
   # ou: ssh seu_usuario@ip-da-vps
   ```

5. Vá até a pasta do projeto e puxe a versão mais recente:
   ```bash
   cd ~/ferrazcon-time-clock
   git fetch origin
   git pull origin main
   ```
   (Troque `main` pela branch que você usa, se for outra.)

6. Build das imagens **sem cache** (para garantir que entram as últimas alterações). Use uma tag fixa (ex.: `v2`) para o Portainer usar a imagem nova:
   ```bash
   docker build --no-cache -t ferrazcon-api:v2 ./server
   docker build --no-cache -t ferrazcon-frontend:v2 -f Dockerfile.frontend .
   ```
   Aguarde os dois builds terminarem.

---

## Parte 3: Portainer – stack e variáveis

7. No Portainer, abra o **stack** do ferrazcon-time-clock (ou crie um novo stack com o nome que preferir).

8. O **compose** do stack deve usar as imagens que você buildou e as variáveis da v2. Exemplo de YAML (ajuste o nome do volume/rede se for diferente no seu ambiente):

   ```yaml
   version: "3.9"

   services:
     api:
       image: ferrazcon-api:v2
       environment:
         NODE_ENV: production
         PORT: 4000
         TZ: America/Sao_Paulo
         DATABASE_URL: file:./data/dev.db
         JWT_SECRET: "SUA_CHAVE_JWT_AQUI_MIN_32_CARACTERES"
         FACIAL_THRESHOLD: "0.90"
         DEVICE_TOKEN: ferrazcon-device-2024
         ENABLE_SHEETS: "true"
         GOOGLE_SERVICE_ACCOUNT_EMAIL: ferrazcon-time-clock@ferrazcon-time-clock.iam.gserviceaccount.com
         GOOGLE_SERVICE_ACCOUNT_KEY: "sua-key-base64"
         GOOGLE_SHEETS_SPREADSHEET_ID: 1m_bgo3yWQGO62Z3IphrClpgPQuvimDm2nZqAuvESuRc
         GOOGLE_SHEETS_TAB: Registros
         UPLOAD_DIR: /app/data/uploads
       volumes:
         - api_data:/app/data
       networks:
         - fzccontabilidade
       deploy:
         replicas: 1
         restart_policy:
           condition: on-failure
         labels:
           - traefik.enable=true
           - traefik.docker.network=fzccontabilidade
           - traefik.http.routers.timeclock-api.rule=Host(`ponto.fzccontabilidade.com.br`) && PathPrefix(`/api`)
           - traefik.http.routers.timeclock-api.entrypoints=websecure
           - traefik.http.routers.timeclock-api.tls=true
           - traefik.http.routers.timeclock-api.tls.certresolver=letsencryptresolver
           - traefik.http.services.timeclock-api.loadbalancer.server.port=4000

     frontend:
       image: ferrazcon-frontend:v2
       networks:
         - fzccontabilidade
       deploy:
         replicas: 1
         restart_policy:
           condition: on-failure
         labels:
           - traefik.enable=true
           - traefik.docker.network=fzccontabilidade
           - traefik.http.routers.timeclock-web.rule=Host(`ponto.fzccontabilidade.com.br`)
           - traefik.http.routers.timeclock-web.entrypoints=websecure
           - traefik.http.routers.timeclock-web.tls=true
           - traefik.http.routers.timeclock-web.tls.certresolver=letsencryptresolver
           - traefik.http.services.timeclock-web.loadbalancer.server.port=80

   networks:
     fzccontabilidade:
       external: true

   volumes:
     api_data:
   ```

   **Importante:** troque `JWT_SECRET` por uma chave forte (ex.: saída de `openssl rand -base64 32`). Mantenha `DEVICE_TOKEN` igual ao que o totem usa. Não commite esse YAML com segredos reais; use variáveis do Portainer ou edite só no editor do stack.

9. Se você preferir usar as variáveis pela tela **Environment variables** do Portainer em vez de deixar no YAML, deixe no YAML só as chaves e use os valores definidos na interface. O essencial é ter **JWT_SECRET** definido para a v2.

10. Salve o stack (**Update the stack**). **Não** marque "Prune services" se você não tiver removido nenhum serviço do YAML.

11. Aguarde os serviços ficarem **Running** (api e frontend). As migrations rodam sozinhas ao subir o container da api.

---

## Parte 4: Seed (só na primeira vez com a v2)

12. Se esta é a **primeira** vez que essa base de dados recebe a v2, rode o seed **uma vez**:
    - No Portainer: **Containers** → clique no container do **api** (ex.: `ferrazcon-time-clock_api.1.xxx`) → **Console** (ou **Exec**).
    - Conecte com **bash** ou **sh**.
    - Rode:
      ```bash
      node dist/seed.js
      ```
      (Ou `npx prisma db seed`.)
    - Deve aparecer “Empresa padrão criada”, “Usuário ADMIN criado”, “Seed concluído.”.

13. Credenciais criadas pelo seed (troque em produção):
    - Admin: `admin@ferrazcon.com.br` / `Ferrazcon@Admin2025!`
    - Gestor Ferrazcon: `gestor@ferrazcon.com.br` / `Gestor@Ferrazcon2025!`
    - Gestor Velz Hub: `gestor@velzhub.com.br` / `VelzHub@Gestor2025!`

---

## Parte 5: Testar

14. No navegador:
    - **https://ponto.fzccontabilidade.com.br** → deve abrir o app (redireciona para totem ou login).
    - **https://ponto.fzccontabilidade.com.br/login** → tela de login da v2.
    - **https://ponto.fzccontabilidade.com.br/admin** → área admin (após login).
    - **https://ponto.fzccontabilidade.com.br/totem** → modo totem.

15. Se aparecer página em branco ou 404 em `/login`, faça um **hard refresh** (Ctrl+Shift+R) ou teste em aba anônima. Se continuar, confira no Traefik se só `/api` vai para o serviço da API e o resto vai para o frontend.

---

## Resumo rápido

| Onde | O que fazer |
|------|-------------|
| **Sua máquina** | `git add .` → `git commit -m "..."` → `git push origin main` |
| **VPS (SSH)** | `cd ~/ferrazcon-time-clock` → `git pull origin main` → `docker build --no-cache -t ferrazcon-api:v2 ./server` → `docker build --no-cache -t ferrazcon-frontend:v2 -f Dockerfile.frontend .` |
| **Portainer** | Stack com `image: ferrazcon-api:v2` e `image: ferrazcon-frontend:v2`, env com **JWT_SECRET** → **Update the stack** |
| **Portainer (1ª vez)** | Console do container **api** → `node dist/seed.js` |
| **Navegador** | https://ponto.fzccontabilidade.com.br/login e /admin |

Para **próximas atualizações**: repita a Parte 1 (push no Git), depois Parte 2 (pull na VPS + build com a mesma tag `v2` ou uma nova, ex. `v2.1`), e na Parte 3 faça **Update the stack** (e troque a tag no YAML se tiver usado uma nova).

Se algo falhar, confira os **logs** dos containers **api** e **frontend** no Portainer.
