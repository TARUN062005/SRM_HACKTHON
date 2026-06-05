// scripts/seedAdmin.js
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config();

const prisma = new PrismaClient();

async function seedAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL ;
    const adminPassword = process.env.ADMIN_PASSWORD ;
    
    console.log('🔄 Seeding admin user...');
    console.log('Admin email:', adminEmail ? adminEmail.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c) : 'N/A');
    
    if (!adminEmail || !adminPassword) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file');
    }
    
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { 
        email: adminEmail,
        role: 'ADMIN' 
      }
    });
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists:', existingAdmin.id);
      await prisma.$disconnect();
      return existingAdmin;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'System Administrator',
        role: 'ADMIN',
        authProvider: 'LOCAL',
        emailVerified: true,
        isActive: true,
        phoneVerified: false,
      }
    });
    
    console.log('✅ Admin user seeded successfully!');
    console.log('Admin ID:', adminUser.id);
    console.log('Admin Email:', adminUser.email ? adminUser.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c) : 'N/A');
    
    await prisma.$disconnect();
    return adminUser;
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    console.error('Stack:', error.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// If this script is run directly
if (require.main === module) {
  seedAdmin()
    .then(() => {
      console.log('✅ Seed script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedAdmin };