// utils/seedAdmin.js
const bcrypt = require('bcryptjs');
const { prisma } = require('./dbConnector');

async function seedAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL ;
    const adminPassword = process.env.ADMIN_PASSWORD ;
    
    console.log('🔄 Checking/creating admin user...');
    
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { 
        email: adminEmail,
        role: 'ADMIN' 
      }
    });
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists:', existingAdmin.id);
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
    
    console.log('✅ Admin user created successfully!');
    console.log('Admin ID:', adminUser.id);
    console.log('Admin Email:', adminUser.email ? adminUser.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c) : 'N/A');
    
    return adminUser;
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    // Don't throw error here to prevent server startup failure
    return null;
  }
}

module.exports = { seedAdmin };