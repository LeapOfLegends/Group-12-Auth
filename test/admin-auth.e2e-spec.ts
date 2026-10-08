import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.constants';

describe('Admin auth E2E', () => {
  let app: INestApplication;
  let pool: Pool;
  let superToken: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL must be set. Use: TEST_DATABASE_URL=postgresql://... npm run test:e2e',
      );
    }

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'e2e-test-secret-at-least-32-characters-long';
    process.env.JWT_ACCESS_EXPIRATION_SECONDS = '3600';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    pool = app.get(PG_POOL);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        admin_id BIGSERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        roles TEXT NOT NULL CHECK (roles IN ('super_admin', 'finance', 'operations'))
      )
    `);

    await pool.query('TRUNCATE TABLE admins RESTART IDENTITY');

    const hash = await bcrypt.hash('SuperAdminPassword123!', 4);
    await pool.query(
      `
      INSERT INTO admins (first_name, last_name, email, password_hash, roles)
      VALUES ('Super', 'Admin', 'superadmin@company.com', $1, 'super_admin')
      `,
      [hash],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (app) {
      await app.close();
    }
  });

  it('rejects protected endpoint with no token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects bad login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'superadmin@company.com',
        password: 'WrongPassword123!',
      })
      .expect(401);
  });

  it('logs in SUPER_ADMIN and returns JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'superadmin@company.com',
        password: 'SuperAdminPassword123!',
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.admin.roles).toEqual(['SUPER_ADMIN']);
    superToken = response.body.accessToken;
  });

  it('returns /me with valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);

    expect(response.body.email).toBe('superadmin@company.com');
  });

  it('SUPER_ADMIN can register FINANCE admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        firstName: 'John',
        lastName: 'Finance',
        email: 'john.finance@company.com',
        password: 'FinancePassword123!',
        role: 'FINANCE',
      })
      .expect(201);

    expect(response.body.email).toBe('john.finance@company.com');
    expect(response.body.roles).toEqual(['FINANCE']);
  });

  it('duplicate registration returns 409', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        firstName: 'John',
        lastName: 'Finance',
        email: 'john.finance@company.com',
        password: 'FinancePassword123!',
        role: 'FINANCE',
      })
      .expect(409);
  });

  it('FINANCE can log in but cannot register admins', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'john.finance@company.com',
        password: 'FinancePassword123!',
      })
      .expect(200);

    const financeToken = loginResponse.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admins')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@company.com',
        password: 'TestPassword123!',
        role: 'OPERATIONS',
      })
      .expect(403);
  });

  it('rejects a fake JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer fake.jwt.token')
      .expect(401);
  });
});
