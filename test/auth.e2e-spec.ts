import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import { AdminRole } from '../src/admins/admin-role.enum';
import { Admin } from '../src/admins/entities/admin.entity';
import { AuthModule } from '../src/auth/auth.module';
import { Client } from '../src/clients/entities/client.entity';

// Exercises HTTP, bcrypt verification and JWT signing without PostgreSQL. Rows go straight into
// in-memory tables because, as in production, this service never creates accounts itself.
describe('Login API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let passwordHash: string;
  const PASSWORD = 'ExamplePassword123!';
  const admins: Admin[] = [];
  const clients: Client[] = [];

  // findOne({ where }) is the only repository method the login path uses.
  const table = <T>(rows: T[]) => ({
    findOne: async ({ where }: { where: Partial<T> }) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key as keyof T] === value)) ?? null,
  });

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({
        JWT_SECRET: 'e2e-secret-with-at-least-32-characters-in-it',
        JWT_EXPIRATION: '15m',
        ADMIN_EMAIL_DOMAINS: 'admin.com, FMR.com',
      }))
      .overrideProvider(getRepositoryToken(Admin))
      .useValue(table(admins))
      .overrideProvider(getRepositoryToken(Client))
      .useValue(table(clients))
      .compile();

    app = fixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    jwt = fixture.get(JwtService);
    passwordHash = await bcrypt.hash(PASSWORD, 12);
  });

  beforeEach(() => {
    admins.length = 0;
    clients.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  // Shaped like the rows Spring Boot writes: lowercase email, $2b$ bcrypt hash, one lowercase role.
  function seedAdmin(overrides: Partial<Admin> = {}) {
    const admin = Object.assign(new Admin(), {
      adminId: String(admins.length + 1),
      firstName: 'Seed',
      lastName: 'Admin',
      email: 'super@admin.com',
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }, overrides);
    admins.push(admin);
    return admin;
  }

  function seedClient(overrides: Partial<Client> = {}) {
    const client = Object.assign(new Client(), {
      clientId: String(clients.length + 1),
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      passwordHash,
      ssn: '123-45-6789',
      phoneNumber: '202-456-1111',
      dateOfBirth: '1990-05-15',
      accountBalance: '0',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }, overrides);
    clients.push(client);
    return client;
  }

  async function post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  const login = (email: string, password = PASSWORD) => post('/auth/login', { email, password });

  it.each([AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE])(
    'logs in a %s admin and returns a JWT carrying the role',
    async (role) => {
      seedAdmin({ role });

      const result = await login('super@admin.com');

      expect(result.status).toBe(200);
      expect(result.body.admin).toMatchObject({ adminId: '1', email: 'super@admin.com', role });
      expect(result.body.admin).not.toHaveProperty('passwordHash');
      expect(result.body).not.toHaveProperty('client');
      expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
        .toMatchObject({ sub: '1', email: 'super@admin.com', role });
    },
  );

  it('logs in a client and returns a JWT carrying the CLIENT role', async () => {
    seedClient();

    const result = await login('jane@example.com');

    expect(result.status).toBe(200);
    expect(result.body.client).toMatchObject({ clientId: '1', email: 'jane@example.com', firstName: 'Jane' });
    expect(result.body.client).not.toHaveProperty('passwordHash');
    expect(result.body.client).not.toHaveProperty('ssn');
    expect(result.body).not.toHaveProperty('admin');
    const payload = await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] });
    expect(payload).toMatchObject({ sub: '1', email: 'jane@example.com', roles: ['CLIENT'] });
    expect(payload).not.toHaveProperty('role');
  });

  it('matches admin emails case-insensitively on every configured domain', async () => {
    seedAdmin({ email: 'ops@fmr.com', role: AdminRole.OPERATIONS });

    const result = await login('  Ops@FMR.com ');

    expect(result.status).toBe(200);
    expect(result.body.admin.role).toBe('operations');
  });

  it('accepts the $2a$ bcrypt prefix Spring Boot uses by default as well as $2b$', async () => {
    seedAdmin({ passwordHash: passwordHash.replace('$2b$', '$2a$') });

    expect((await login('super@admin.com')).status).toBe(200);
  });

  it('never checks the clients table for an admin-domain email', async () => {
    seedClient({ email: 'someone@admin.com' });

    expect((await login('someone@admin.com')).status).toBe(401);
  });

  it('rejects wrong passwords and unknown emails without issuing tokens', async () => {
    seedAdmin();
    seedClient();

    const results = [
      await login('super@admin.com', 'WrongPassword123!'),
      await login('jane@example.com', 'WrongPassword123!'),
      await login('unknown@admin.com'),
      await login('unknown@example.com'),
    ];

    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.body.message).toBe('Invalid credentials');
      expect(result.body).not.toHaveProperty('accessToken');
    }
  });

  it('validates the body and exposes no registration routes', async () => {
    seedAdmin();

    expect((await post('/auth/login', { email: 'not-an-email', password: PASSWORD })).status).toBe(400);
    expect((await post('/auth/login', { email: 'super@admin.com', password: PASSWORD, role: 'super_admin' })).status).toBe(400);

    for (const path of ['/auth/register', '/api/auth/register', '/api/auth/login']) {
      expect((await post(path, { email: 'super@admin.com', password: PASSWORD })).status).toBe(404);
    }
  });
});
