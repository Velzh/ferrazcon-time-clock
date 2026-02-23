import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { prisma } from './lib/prisma';

const ADMIN_EMAIL = 'admin@ferrazcon.com.br';
const ADMIN_PASSWORD = 'Ferrazcon@Admin2025!';
const GESTOR_EMAIL = 'gestor@ferrazcon.com.br';
const GESTOR_PASSWORD = 'Gestor@Ferrazcon2025!';
const VELZHUB_GESTOR_EMAIL = 'gestor@velzhub.com.br';
const VELZHUB_GESTOR_PASSWORD = 'VelzHub@Gestor2025!';
const DEFAULT_DEVICE_TOKEN = process.env.DEVICE_TOKEN || 'local-demo';

async function main() {
  let empresa = await prisma.empresa.findFirst({ where: { slug: 'ferrazcon' } });
  if (!empresa) {
    empresa = await prisma.empresa.create({
      data: {
        name: 'Ferrazcon',
        slug: 'ferrazcon',
        active: true,
      },
    });
    console.log('Empresa padrão "ferrazcon" criada:', empresa.id);
  }

  let velzHub = await prisma.empresa.findFirst({ where: { slug: 'velzhub' } });
  if (!velzHub) {
    velzHub = await prisma.empresa.create({
      data: {
        name: 'Velz Hub',
        slug: 'velzhub',
        active: true,
      },
    });
    console.log('Empresa "Velz Hub" criada:', velzHub.id);
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: Role.ADMIN,
        empresaId: null,
        active: true,
      },
    });
    console.log('Usuário ADMIN criado:', ADMIN_EMAIL);
  }

  const existingGestor = await prisma.user.findUnique({ where: { email: GESTOR_EMAIL } });
  if (!existingGestor) {
    const gestorHash = await bcrypt.hash(GESTOR_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: GESTOR_EMAIL,
        passwordHash: gestorHash,
        role: Role.GESTOR,
        empresaId: empresa.id,
        active: true,
      },
    });
    console.log('Usuário GESTOR criado:', GESTOR_EMAIL, '(empresa:', empresa.slug + ')');
  }

  const existingVelzGestor = await prisma.user.findUnique({ where: { email: VELZHUB_GESTOR_EMAIL } });
  if (!existingVelzGestor) {
    const velzHash = await bcrypt.hash(VELZHUB_GESTOR_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: VELZHUB_GESTOR_EMAIL,
        passwordHash: velzHash,
        role: Role.GESTOR,
        empresaId: velzHub.id,
        active: true,
      },
    });
    console.log('Usuário GESTOR Velz Hub criado:', VELZHUB_GESTOR_EMAIL);
  }

  const employeesWithoutEmpresa = await prisma.employee.count({
    where: { empresaId: null },
  });
  if (employeesWithoutEmpresa > 0) {
    await prisma.employee.updateMany({
      where: { empresaId: null },
      data: { empresaId: empresa.id },
    });
    console.log('Backfill: %d colaboradores vinculados à empresa padrão', employeesWithoutEmpresa);
  }

  const existingDevice = await prisma.device.findFirst({
    where: { secret: DEFAULT_DEVICE_TOKEN },
  });
  if (!existingDevice) {
    await prisma.device.create({
      data: {
        name: 'Totem padrão',
        secret: DEFAULT_DEVICE_TOKEN,
        location: 'Sede',
        active: true,
        empresaId: empresa.id,
      },
    });
    console.log('Device padrão (totem) criado e vinculado à empresa ferrazcon');
  }

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
