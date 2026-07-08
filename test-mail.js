const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');

async function test() {
  const resolve4 = promisify(dns.resolve4);
  const ips = await resolve4('smtp.gmail.com');
  console.log('IPv4 addresses:', ips);
  
  const transporter = nodemailer.createTransport({
    host: ips[0],
    port: 465,
    secure: true,
    auth: {
      user: 'test@gmail.com',
      pass: 'test'
    },
    tls: {
      servername: 'smtp.gmail.com'
    }
  });

  try {
    await transporter.verify();
    console.log('Connected!');
  } catch (e) {
    console.log('Error:', e.message);
  }
}
test();
