#!/bin/bash

# Script para resolver conflitos e fazer pull no servidor
# Execute este script no servidor VPS

set -e

cd /opt/ferrazcon-time-clock

echo "=========================================="
echo "Resolvendo conflitos e atualizando código"
echo "=========================================="

echo ""
echo "1. Verificando status do Git..."
git status

echo ""
echo "2. Fazendo backup das mudanças locais (caso precise depois)..."
git stash save "backup-local-changes-$(date +%Y%m%d-%H%M%S)"

echo ""
echo "3. Fazendo pull das correções do GitHub..."
git pull origin main

echo ""
echo "4. Verificando se os arquivos foram atualizados corretamente..."
echo ""

if grep -q 'engineType = "binary"' server/prisma/schema.prisma; then
    echo "✓ schema.prisma está correto (engineType = binary)"
else
    echo "✗ ERRO: schema.prisma não está correto"
    exit 1
fi

if ! grep -q "PrismaLibSql\|adapter" server/src/lib/prisma.ts; then
    echo "✓ prisma.ts está correto (sem adapter)"
else
    echo "✗ ERRO: prisma.ts ainda tem adapter"
    exit 1
fi

echo ""
echo "=========================================="
echo "Código atualizado com sucesso!"
echo "=========================================="
echo ""
echo "Próximos passos:"
echo "1. Parar a Stack no Portainer"
echo "2. Executar: docker builder prune -f"
echo "3. Executar: docker build --no-cache -t ferrazcon-api:latest -f server/Dockerfile ./server"
echo "4. Atualizar a Stack no Portainer"
echo ""

