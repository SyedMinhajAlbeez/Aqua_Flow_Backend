// seed.js
const prisma = require('./src/prisma/client');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    const hashed = await bcrypt.hash('123456', 10);
    await prisma.user.upsert({
      where: { email: 'admin@system.com' },
      update: {},
      create: {
        name: 'Super Admin',
        email: 'admin@system.com',
        password: hashed,
        role: 'super_admin',
        tenantId: null
      }
    });
    console.log('Super Admin seeded successfully!');
  } catch (err) {
    console.error('Error seeding:', err.message);
  } finally {
    await prisma.$disconnect();
    process.exit();
  }
}

seed();