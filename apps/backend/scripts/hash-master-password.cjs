#!/usr/bin/env node
/**
 * Generate a bcrypt hash for ERP_MASTER_PASSWORD_HASH.
 * Usage: node scripts/hash-master-password.cjs "your-master-password"
 */
const bcrypt = require("bcrypt");

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-master-password.cjs \"your-master-password\"");
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log(hash);
});
