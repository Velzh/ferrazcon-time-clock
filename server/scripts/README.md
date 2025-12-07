# Scripts de Gerenciamento do Banco de Dados

## Script `db-manager.js`

Script Node.js para gerenciar colaboradores diretamente no banco de dados SQLite.

### Como usar:

1. **Listar todos os colaboradores:**
   ```bash
   cd /home/kaua/projects/ferrazcon-time-clock/server
   node scripts/db-manager.js list
   ```

2. **Remover um colaborador específico:**
   ```bash
   node scripts/db-manager.js delete <ID_DO_COLABORADOR>
   ```
   
   Exemplo:
   ```bash
   node scripts/db-manager.js delete cmivq4ybk0000ehi53us5m74f
   ```

3. **Remover TODOS os colaboradores (cuidado!):**
   ```bash
   node scripts/db-manager.js clear
   ```

### Onde fica o banco de dados?

O arquivo SQLite está em:
```
/home/kaua/projects/ferrazcon-time-clock/server/dev.db
```

### Nota sobre SQLite CLI

Se você quiser usar o `sqlite3` diretamente, primeiro instale:
```bash
sudo apt-get update
sudo apt-get install sqlite3
```

Depois acesse:
```bash
cd /home/kaua/projects/ferrazcon-time-clock/server
sqlite3 dev.db
```

Dentro do SQLite:
```sql
.tables                    -- Lista todas as tabelas
SELECT * FROM Employee;    -- Lista colaboradores
DELETE FROM Employee WHERE id = 'cmiv...';  -- Remove colaborador
.quit                      -- Sair
```

**Mas recomendo usar o script `db-manager.js` que é mais seguro e mostra informações úteis!**

