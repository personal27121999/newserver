const Admin = require('../models/Admin');

const seedAdmin = async () => {
  try {
    const email    = process.env.ADMIN_EMAIL    || 'admin@groceryshop.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123';
    const name     = process.env.ADMIN_NAME     || 'Super Admin';

    const existing = await Admin.findOne({ email }).select('+password');

    if (!existing) {
      // First run — create admin
      await Admin.create({ name, email, password, role: 'superadmin' });
      console.log('🌱 Default admin created:');
      console.log(`   Email:    ${email}`);
      console.log(`   Password: ${password}`);
      console.log('   ⚠️  Please change the password after first login!');
      return;
    }

    // Admin exists — verify password still matches .env
    const passwordMatch = await existing.comparePassword(password);
    if (!passwordMatch) {
      // Hash mismatch (DB from old run / password changed in .env) — reset it
      existing.password = password;   // pre-save hook will re-hash
      await existing.save({ validateBeforeSave: false });
      console.log(`🔑 Admin password reset to match .env: ${email}`);
    } else {
      console.log(`✅ Admin already exists: ${email}`);
    }
  } catch (error) {
    console.error('Seed error:', error.message);
  }
};

module.exports = { seedAdmin };
