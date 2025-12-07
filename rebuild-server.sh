#!/bin/bash

# Script para rebuild completo da API no servidor
# Execute este script no servidor VPS após fazer git pull

set -e

echo "=========================================="
echo "Rebuild da API Ferrazcon Time Clock"
echo "=========================================="

cd /opt/ferrazcon-time-clock || cd ~/ferrazcon-time-clock

echo ""
echo "1. Verificando código atualizado..."
echo ""

# Verificar se schema.prisma está correto
if grep -q 'engineType = "binary"' server/prisma/schema.prisma; then
    echo "✓ schema.prisma está correto (engineType = binary)"
else
    echo "✗ ERRO: schema.prisma ainda tem engineType = library"
    echo "Execute: git pull origin main"
    exit 1
fi

# Verificar se prisma.ts não tem adapter
if grep -q "PrismaLibSql\|adapter" server/src/lib/prisma.ts; then
    echo "✗ ERRO: prisma.ts ainda tem adapter libsql"
    echo "Execute: git pull origin main"
    exit 1
else
    echo "✓ prisma.ts está correto (sem adapter)"
fi

# Verificar Dockerfile
if grep -A 1 "prisma generate" server/Dockerfile | grep -q "COPY src"; then
    echo "✗ ERRO: Dockerfile tem ordem errada (prisma generate depois de COPY src)"
    echo "Execute: git pull origin main"
    exit 1
else
    echo "✓ Dockerfile está correto"
fi

echo ""
echo "2. Parando containers antigos..."
echo ""

# Parar containers da API
docker ps -a | grep ferrazcon-time-clock_api | awk '{print $1}' | xargs -r docker stop 2>/dev/null || true
docker ps -a | grep ferrazcon-time-clock_api | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true

echo "✓ Containers antigos removidos"

echo ""
echo "3. Limpando cache do Docker..."
echo ""

docker builder prune -f

echo "✓ Cache limpo"

echo ""
echo "4. Removendo imagem antiga..."
echo ""

docker rmi ferrazcon-api:latest 2>/dev/null || docker rmi ferrazcon-time-clock-api:latest 2>/dev/null || echo "Imagem não encontrada (ok)"

echo ""
echo "5. Fazendo rebuild da imagem (isso pode levar alguns minutos)..."
echo ""

docker build --no-cache -t ferrazcon-api:latest -f server/Dockerfile ./server

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Build concluído com sucesso!"
    echo ""
    echo "6. Verificando imagem criada..."
    docker images | grep ferrazcon-api
    echo ""
    echo "=========================================="
    echo "Próximos passos:"
    echo "1. No Portainer, vá em Stacks → ferrazcon-time-clock"
    echo "2. Clique em 'Editor'"
    echo "3. Clique em 'Update the stack'"
    echo "4. Verifique os logs do container 'api'"
    echo "=========================================="
else
    echo ""
    echo "✗ ERRO no build. Verifique os logs acima."
    exit 1
fi

