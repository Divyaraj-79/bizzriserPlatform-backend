require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  console.log('Testing Cloudinary Image...');
  try {
    // create a dummy image to upload
    fs.writeFileSync('test.jpg', 'dummy image content');
    const res = await cloudinary.uploader.upload('test.jpg', { 
      folder: 'test',
      public_id: 'my_test_image' // no extension
    });
    console.log('Upload success:', res.secure_url);
  } catch (err) {
    console.error('Upload failed:', err);
  }
}
run();
