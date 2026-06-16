const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AuthService } = require('./dist/modules/auth/auth.service');
const { UsersService } = require('./dist/modules/users/users.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  const usersService = app.get(UsersService);

  const user = await usersService.findByEmail('admin@bizzriser.com');
  const loginRes = await authService.login(user);
  
  console.log('Login Refresh Token:', loginRes.refresh_token);

  try {
    const refreshRes = await authService.refreshToken(loginRes.refresh_token);
    console.log('Refresh successful. Access Token:', refreshRes.access_token);
  } catch (e) {
    console.error('Refresh Failed:', e.message);
  }

  await app.close();
}

bootstrap();
