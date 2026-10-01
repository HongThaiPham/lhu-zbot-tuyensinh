import { PrismaClientManager } from '@lhu/database';
import { loadBootstrapAdminConfig } from '@lhu/config';
import { PasswordService } from '../auth/password.service';
import { normalizeEmail } from '../auth/auth.service';

const prismaManager = new PrismaClientManager();
const passwordService = new PasswordService();

async function main() {
  const bootstrapConfig = loadBootstrapAdminConfig(process.env);

  await prismaManager.connect();
  const prisma = prismaManager.client;

  await prisma.$transaction(async (tx) => {
    const existingRole = await tx.role.findUnique({
      where: {
        name: 'ADMIN',
      },
      select: {
        id: true,
      },
    });

    const role =
      existingRole ??
      (await tx.role.create({
        data: {
          name: 'ADMIN',
        },
        select: {
          id: true,
        },
      }));

    const normalizedEmail = normalizeEmail(bootstrapConfig.email);

    const existingUser = await tx.user.findUnique({
      where: {
        normalizedEmail,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      const roleAssignment = await tx.userRole.findUnique({
        where: {
          userId_roleId: {
            userId: existingUser.id,
            roleId: role.id,
          },
        },
      });

      if (!roleAssignment) {
        await tx.userRole.create({
          data: {
            userId: existingUser.id,
            roleId: role.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: existingUser.id,
            action: 'ADMIN_ROLE_ASSIGNED',
            entityType: 'user',
            entityId: existingUser.id,
            metadata: {
              role: 'ADMIN',
              source: 'bootstrap-admin',
            },
          },
        });
      }

      console.log('Bootstrap admin already exists; no password reset performed');
      return;
    }

    const passwordHash = await passwordService.hashPassword(bootstrapConfig.password);

    const user = await tx.user.create({
      data: {
        email: bootstrapConfig.email,
        normalizedEmail,
        passwordHash,
      },
      select: {
        id: true,
      },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'ADMIN_BOOTSTRAPPED',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          source: 'bootstrap-admin',
        },
      },
    });

    console.log('Bootstrap admin created and assigned ADMIN role');
  });
}

main()
  .catch((error) => {
    console.error('Bootstrap admin failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaManager.disconnect();
  });
