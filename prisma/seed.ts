const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    // Clear existing data (optional, but good for clean seeding)
    // await prisma.rolePermission.deleteMany({});
    // await prisma.permission.deleteMany({});
    // await prisma.user.deleteMany({});
    // await prisma.role.deleteMany({});

    // 1. Create Permissions
    const permissionKeys = [
        'ro.view', 'ro.edit', 'ro.create',
        'billing.view', 'billing.edit',
        'parts.view', 'parts.edit',
        'ndc.view', 'ndc.edit',
        'users.manage', 'roles.manage',
        'import.manage',
        'dashboard.view',
        'branches.view_all',
        'branches.view_multi'
    ];

    const permissions = [];
    for (const key of permissionKeys) {
        const p = await prisma.permission.upsert({
            where: { key },
            update: {},
            create: { key },
        });
        permissions.push(p);
    }

    // 2. Create Roles
    const rolesData = [
        { name: 'Owner/Admin', permissions: permissionKeys },
        { name: 'Service Manager', permissions: ['ro.view', 'ro.edit', 'billing.view', 'parts.view', 'ndc.view', 'dashboard.view', 'branches.view_multi'] },
        { name: 'Bodyshop Advisor', permissions: ['ro.view', 'ro.create', 'ro.edit', 'parts.view', 'ndc.view', 'dashboard.view'] },
        { name: 'Parts Manager/Store', permissions: ['parts.view', 'parts.edit', 'ro.view'] },
        { name: 'Accounts/Cashier', permissions: ['billing.view', 'billing.edit', 'ro.view'] },
        { name: 'Technician', permissions: ['ro.view', 'ro.edit'] }, // Can update notes/status
        { name: 'Read-only/Auditor', permissions: ['ro.view', 'billing.view', 'parts.view', 'ndc.view', 'dashboard.view'] },
    ];

    for (const roleData of rolesData) {
        const role = await prisma.role.upsert({
            where: { name: roleData.name },
            update: {},
            create: { name: roleData.name },
        });

        // Assign permissions to role
        for (const pKey of roleData.permissions) {
            const permission = permissions.find(p => p.key === pKey);
            if (permission) {
                await prisma.rolePermission.upsert({
                    where: {
                        roleId_permissionId: {
                            roleId: role.id,
                            permissionId: permission.id,
                        },
                    },
                    update: {},
                    create: {
                        roleId: role.id,
                        permissionId: permission.id,
                    },
                });
            }
        }
    }

    // 3. Create Admin / Owner users (100% access via Owner/Admin role)
    // App owner: mayank.arvind.bansal@gmail.com — initial password admin123, change on first login
    const adminRole = await prisma.role.findUnique({ where: { name: 'Owner/Admin' } });
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const adminUsers = [
        { email: 'mayank.arvind.bansal@gmail.com', name: 'Mayank Bansal' }, // App owner
    ];

    for (const { email, name } of adminUsers) {
        await prisma.user.upsert({
            where: { email },
            update: { name, roleId: adminRole.id, active: true },
            create: {
                name,
                email,
                passwordHash: hashedPassword,
                roleId: adminRole.id,
                active: true,
            },
        });
    }

    console.log('Seed completed successfully');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
