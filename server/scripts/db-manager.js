#!/usr/bin/env node

/**
 * Script para gerenciar o banco de dados SQLite
 * 
 * Uso:
 *   node scripts/db-manager.js list          - Lista todos os colaboradores
 *   node scripts/db-manager.js delete <id>    - Remove um colaborador pelo ID
 *   node scripts/db-manager.js clear         - Remove TODOS os colaboradores (cuidado!)
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

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'list':
        const employees = await prisma.employee.findMany({
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: {
                faceEmbeddings: true,
                timeEntries: true,
              },
            },
          },
        });

        console.log('\n📋 Colaboradores cadastrados:\n');
        if (employees.length === 0) {
          console.log('  (nenhum colaborador cadastrado)\n');
        } else {
          employees.forEach((emp) => {
            console.log(`  ID: ${emp.id}`);
            console.log(`  Nome: ${emp.name}`);
            console.log(`  Identificador: ${emp.identifier}`);
            console.log(`  E-mail: ${emp.email || '(não informado)'}`);
            console.log(`  Biometrias: ${emp._count.faceEmbeddings}`);
            console.log(`  Registros de ponto: ${emp._count.timeEntries}`);
            console.log(`  Criado em: ${emp.createdAt.toLocaleString('pt-BR')}`);
            console.log('  ──────────────────────────────────────\n');
          });
        }
        break;

      case 'delete':
        if (!arg) {
          console.error('❌ Erro: forneça o ID do colaborador');
          console.log('   Uso: node scripts/db-manager.js delete <id>');
          process.exit(1);
        }

        const employee = await prisma.employee.findUnique({
          where: { id: arg },
          include: {
            _count: {
              select: {
                faceEmbeddings: true,
                timeEntries: true,
              },
            },
          },
        });

        if (!employee) {
          console.error(`❌ Colaborador com ID "${arg}" não encontrado`);
          process.exit(1);
        }

        console.log(`\n🗑️  Removendo colaborador:`);
        console.log(`   Nome: ${employee.name}`);
        console.log(`   Biometrias: ${employee._count.faceEmbeddings}`);
        console.log(`   Registros de ponto: ${employee._count.timeEntries}`);

        await prisma.employee.delete({ where: { id: arg } });
        console.log(`\n✅ Colaborador removido com sucesso!\n`);
        break;

      case 'clear':
        console.log('\n⚠️  ATENÇÃO: Isso vai remover TODOS os colaboradores!');
        console.log('   Pressione Ctrl+C para cancelar ou aguarde 3 segundos...\n');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const count = await prisma.employee.count();
        await prisma.employee.deleteMany({});
        console.log(`✅ ${count} colaborador(es) removido(s)\n`);
        break;

      default:
        console.log('\n📖 Uso do script:\n');
        console.log('  node scripts/db-manager.js list          - Lista todos os colaboradores');
        console.log('  node scripts/db-manager.js delete <id>   - Remove um colaborador pelo ID');
        console.log('  node scripts/db-manager.js clear         - Remove TODOS os colaboradores\n');
        break;
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

