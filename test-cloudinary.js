require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  try {
    fs.writeFileSync('test.txt', 'dummy text content');
    const res = await cloudinary.uploader.upload('test.txt', { folder: 'test', resource_type: 'raw', public_id: 'my_test_file.txt' });
    console.log('Upload success:', res.secure_url);
  } catch (err) {
    console.error('Upload failed:', err);
  }
}
run();
