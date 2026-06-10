const jwt = require('jsonwebtoken');
const token = jwt.sign({ orgId: 'test', sub: 'user_123', role: 'ADMIN' }, process.env.JWT_SECRET || 'change_this_to_a_strong_secret_at_least_32_chars');
console.log(token);
