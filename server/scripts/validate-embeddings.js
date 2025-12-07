#!/usr/bin/env node

/**
 * Script para validar e limpar embeddings inválidos do banco de dados
 * 
 * Uso:
 *   node scripts/validate-embeddings.js check    - Verifica embeddings sem remover
 *   node scripts/validate-embeddings.js clean    - Remove embeddings inválidos
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const adapter = new PrismaLibSql({
  url: databaseUrl,
  authToken: authToken,
});

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

function isValidEmbedding(embedding) {
  if (!Array.isArray(embedding)) {
    return false;
  }

  if (embedding.length < 128 || embedding.length > 512) {
    return false;
  }

  return embedding.every((val) => Number.isFinite(val));
}

async function main() {
  const command = process.argv[2] || 'check';

  try {
    const allEmbeddings = await prisma.faceEmbedding.findMany({
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            identifier: true,
          },
        },
      },
    });

    console.log(`\n📊 Total de embeddings no banco: ${allEmbeddings.length}\n`);

    const invalidEmbeddings = [];
    const validEmbeddings = [];

    for (const embedding of allEmbeddings) {
      try {
        const embeddingData = typeof embedding.embedding === 'string' 
          ? JSON.parse(embedding.embedding)
          : embedding.embedding;

        if (!isValidEmbedding(embeddingData)) {
          invalidEmbeddings.push({
            id: embedding.id,
            employee: embedding.employee,
            reason: !Array.isArray(embeddingData)
              ? 'Não é um array'
              : embeddingData.length < 128 || embeddingData.length > 512
              ? `Tamanho inválido: ${embeddingData.length}`
              : 'Contém valores não numéricos',
          });
        } else {
          validEmbeddings.push({
            id: embedding.id,
            employee: embedding.employee,
            size: embeddingData.length,
          });
        }
      } catch (error) {
        invalidEmbeddings.push({
          id: embedding.id,
          employee: embedding.employee,
          reason: `Erro ao processar: ${error.message}`,
        });
      }
    }

    console.log(`✅ Embeddings válidos: ${validEmbeddings.length}`);
    if (validEmbeddings.length > 0) {
      console.log('   Tamanhos encontrados:', [...new Set(validEmbeddings.map((e) => e.size))].join(', '));
    }

    console.log(`\n❌ Embeddings inválidos: ${invalidEmbeddings.length}`);
    if (invalidEmbeddings.length > 0) {
      console.log('\n   Detalhes:');
      invalidEmbeddings.forEach((inv) => {
        console.log(`   - ID: ${inv.id}`);
        console.log(`     Colaborador: ${inv.employee.name} (${inv.employee.identifier})`);
        console.log(`     Motivo: ${inv.reason}`);
        console.log('');
      });

      if (command === 'clean') {
        console.log('🗑️  Removendo embeddings inválidos...\n');
        const idsToDelete = invalidEmbeddings.map((inv) => inv.id);
        const result = await prisma.faceEmbedding.deleteMany({
          where: {
            id: {
              in: idsToDelete,
            },
          },
        });
        console.log(`✅ ${result.count} embedding(s) removido(s)\n`);
        console.log('⚠️  ATENÇÃO: Os colaboradores afetados precisarão recadastrar suas biometrias!\n');
      } else {
        console.log('\n💡 Para remover embeddings inválidos, execute:');
        console.log('   node scripts/validate-embeddings.js clean\n');
      }
    } else {
      console.log('   Nenhum embedding inválido encontrado! ✅\n');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

