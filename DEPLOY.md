# Deploy na VPS – Gestão de ponto (Ferrazcon)

Passo a passo para subir a **nova versão** do app na VPS. Este guia considera deploy via **Portainer** (variáveis na interface, stack a partir do repositório Git).

---

## 1. Código no repositório

1. Na sua máquina, **commit e push** da versão que deseja subir:
   ```bash
   cd ferrazcon-time-clock
   git add .
   git commit -m "v2: multi-tenant, folha, importação, Gestão de ponto"
   git push origin main
   ```

---

## 2. Variáveis de ambiente no Portainer

2. No Portainer, abra o **stack** do ferrazcon-time-clock e vá em **Environment variables** (ou na tela onde você define as variáveis do stack).

3. Confira/adicione estas variáveis. As que você já tinha da v1 mantêm; para a v2 é **obrigatório** ter **JWT_SECRET**:

   | Variável | Obrigatório | Descrição |
   |----------|-------------|-----------|
   | `JWT_SECRET` | **Sim** (v2) | Chave forte (32+ caracteres) para tokens de login. Gere com `openssl rand -base64 32`. |
   | `DEVICE_TOKEN` | Sim | Mesmo valor que o totem usa no header `X-Device-Token`. |
   | `DATABASE_URL` | Sim | Ex.: `file:./data/dev.db` (volume persiste em `/app/data`). |
   | `VITE_API_URL` | Sim (build) | Use `/api` para o frontend atrás do proxy. |
   | `PORT` | Não | Default 4000 para a API. |
   | `NODE_ENV` | Não | `production`. |
   | `TZ` | Não | Ex.: `America/Sao_Paulo`. |
   | `UPLOAD_DIR` | Não | Default no compose: `/app/data/uploads`. Só defina se quiser outro. |
   | `OPENAI_API_KEY` | Não | Só se for usar normalização por IA na importação de folha. |
   | `FACIAL_THRESHOLD`, `ENABLE_SHEETS`, Google Sheets... | Conforme v1 | Mantenha como na v1 se já usava. |

4. Salve as variáveis no Portainer (sem criar arquivo `.env` no servidor).

---

## 3. Atualizar e subir a nova versão no Portainer

5. Com o código já em `main` e as variáveis atualizadas:
   - No stack, use **Pull and redeploy** (ou **Update the stack** + **Redeploy**) para que o Portainer busque o repositório, faça o **build** das imagens e suba os containers com as novas variáveis.
   - Se o stack for “web editor” e o repositório for atualizado manualmente na VPS, atualize o `docker-compose` no editor (ou via Git no servidor) e depois **Redeploy** (e **Rebuild** se precisar rebuildar as imagens).

6. Aguarde o build e o deploy. Verifique se os dois serviços (**api** e **frontend**) estão **Running**.

7. **Migrations**: ao subir, o container **api** roda `npx prisma migrate deploy`. Na primeira vez da v2, as novas tabelas (Empresa, User, Folha, Importação, etc.) são criadas automaticamente.

---

## 4. Seed (só na primeira vez com a v2)

8. Se esta é a **primeira** implantação da versão multi-tenant nessa base, rode o **seed** uma vez (empresa padrão, usuário admin, device do totem). **Só funciona depois** de ter feito o Pull and redeploy (a imagem precisa estar com o seed configurado).
   - No Portainer: **Containers** → clique no container **api** do stack (ex.: `ferrazcon-time-clock_api_1`) → **Console** (ou **>_ Console** / **Exec**).
   - Conecte com o shell (**bash** ou **sh**).
   - Dentro do container, execute:
     ```bash
     npx prisma db seed
     ```
   - Você deve ver mensagens como “Empresa padrão criada”, “Usuário ADMIN criado”, “Seed concluído.”.

   Credenciais criadas pelo seed (troque em produção):
   - Admin: `admin@ferrazcon.com.br` / `Ferrazcon@Admin2025!`
   - Gestor Ferrazcon: `gestor@ferrazcon.com.br` / `Gestor@Ferrazcon2025!`
   - Gestor Velz Hub: `gestor@velzhub.com.br` / `VelzHub@Gestor2025!`

---

## 5. Traefik / HTTPS (se já usava na v1)

9. Se na v1 o acesso era por **Traefik** em `ponto.fzccontabilidade.com.br`, mantenha a mesma rota apontando para o serviço **frontend**. O proxy interno do frontend já envia `/api` para o container **api**. Nenhuma alteração obrigatória no Traefik para a v2.

10. Teste no navegador:
    - `https://ponto.fzccontabilidade.com.br` → abre o app.
    - `/login` → login com um usuário do seed (após rodar o seed).
    - `/totem` → modo totem (header `X-Device-Token` = valor de `DEVICE_TOKEN` no Portainer).

---

## Resumo rápido (Portainer)

1. **Código:** `git push origin main`
2. **Portainer:** variáveis em Environment variables (incluir **JWT_SECRET** para v2) → Salvar
3. **Portainer:** no stack → **Pull and redeploy** (ou Update + Redeploy/Rebuild)
4. Verificar **api** e **frontend** em Running
5. Primeira vez v2: rodar seed no container **api** (Console/Exec)
6. Acessar o site e testar login e totem

Se algo falhar, confira os **logs** dos containers **api** e **frontend** no Portainer.
