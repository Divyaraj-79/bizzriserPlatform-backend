const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function test() {
  try {
    console.log('Logging in to prod...');
    const loginRes = await axios.post('https://bizzriserplatform-backend.onrender.com/api/v1/auth/login', {
      email: 'admin@bizzriser.com',
      password: 'password123'
    });
    const token = loginRes.data.data.access_token;
    console.log('Got token');

    const form = new FormData();
    form.append('image', Buffer.from('dummy image data'), {
      filename: 'test.jpg',
      contentType: 'image/jpeg'
    });

    console.log('Uploading image to prod...');
    const uploadRes = await axios.post('https://bizzriserplatform-backend.onrender.com/api/v1/meta-commerce/upload-image', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: 'Bearer ' + token
      }
    });
    console.log('Upload success:', uploadRes.data);
  } catch (err) {
    console.error('Upload failed:');
    if (err.response) {
      console.error(err.response.status, err.response.data);
    } else {
      console.error(err.message);
    }
  }
}
test();
