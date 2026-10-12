import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import { AdminAuthModule } from '../src/admin-auth/admin-auth.module';
import { AdminRole } from '../src/admins/admin-role.enum';
import { Admin } from '../src/admins/entities/admin.entity';

// Exercise HTTP, hashing, JWT signing and the super admin guard without PostgreSQL.
describe('Admin auth API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let superAdminHash: string;
  const admins: Admin[] = [];
  const superAdmin = { email: 'super@example.com', password: 'SuperPassword123!' };
  const registration = {
    email: 'new.admin@example.com',
    password: 'ExamplePassword123!',
    firstName: 'Alex',
    lastName: 'Admin',
    role: AdminRole.OPERATIONS,
  };
  const repository = {
    create: (data: Partial<Admin>) => Object.assign(new Admin(), data),
    save: async (admin: Admin) => {
      const saved = Object.assign(admin, {
        adminId: String(admins.length + 1),
        active: admin.active ?? true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updated: new Date('2026-01-01T00:00:00Z'),
      });
      admins.push(saved);
      return saved;
    },
    findOne: async ({ where }: { where: Partial<Admin> }) =>
      admins.find((admin) => Object.entries(where).every(([key, value]) => admin[key as keyof Admin] === value)) ?? null,
    findOneByOrFail: async ({ adminId }: { adminId: string }) => {
      const admin = admins.find((entry) => entry.adminId === adminId);
      if (!admin) throw new Error('Admin fixture not found');
      return admin;
    },
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AdminAuthModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({
        JWT_SECRET: 'admin-e2e-secret-with-at-least-32-characters',
        JWT_EXPIRATION: '15m',
      }))
      .overrideProvider(getRepositoryToken(Admin))
      .useValue(repository)
      .compile();

    app = fixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    jwt = fixture.get(JwtService);
    superAdminHash = await bcrypt.hash(superAdmin.password, 12);
  });

  // Every test starts with the one super admin that already exists in the database.
  beforeEach(async () => {
    admins.length = 0;
    await repository.save(repository.create({
      email: superAdmin.email,
      passwordHash: superAdminHash,
      firstName: 'Seed',
      lastName: 'Super',
      role: AdminRole.SUPER_ADMIN,
    }));
  });

  afterAll(async () => {
    await app?.close();
  });

  async function post(path: string, body: unknown, token?: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  function login(email: string, password: string) {
    return post('/api/auth/login', { email, password });
  }

  it('logs in the existing super admin and returns a JWT carrying the role', async () => {
    const result = await login(superAdmin.email, superAdmin.password);

    expect(result.status).toBe(200);
    expect(result.body.admin).toMatchObject({ adminId: '1', email: superAdmin.email, role: 'super_admin', active: true });
    expect(result.body.admin).not.toHaveProperty('passwordHash');
    expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
      .toMatchObject({ sub: '1', email: superAdmin.email, role: 'super_admin' });
  });

  it.each([AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE])(
    'lets a super admin register a %s admin who can then log in',
    async (role) => {
      const token = (await login(superAdmin.email, superAdmin.password)).body.accessToken;
      const registered = await post('/api/auth/register', { ...registration, role }, token);

      expect(registered.status).toBe(201);
      expect(registered.body).toMatchObject({ adminId: '2', email: registration.email, role, active: true });
      expect(registered.body).not.toHaveProperty('passwordHash');
      expect(bcrypt.getRounds(admins[1].passwordHash)).toBe(12);
      expect(await bcrypt.compare(registration.password, admins[1].passwordHash)).toBe(true);

      const result = await login(registration.email, registration.password);
      expect(result.status).toBe(200);
      expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
        .toMatchObject({ sub: '2', email: registration.email, role });
    },
  );

  it('rejects registration from operations and finance admins and from missing, forged or client tokens', async () => {
    const superToken = (await login(superAdmin.email, superAdmin.password)).body.accessToken;
    for (const role of [AdminRole.OPERATIONS, AdminRole.FINANCE]) {
      const email = `${role}@example.com`;
      expect((await post('/api/auth/register', { ...registration, email, role }, superToken)).status).toBe(201);
      const token = (await login(email, registration.password)).body.accessToken;
      expect((await post('/api/auth/register', { ...registration, email: 'x@example.com' }, token)).status).toBe(403);
    }

    const forged = await new JwtService({ secret: 'another-secret' }).signAsync({ sub: '1', role: 'super_admin' });
    const clientToken = await jwt.signAsync({ sub: '1', email: 'client@example.com' });

    expect((await post('/api/auth/register', registration)).status).toBe(401);
    expect((await post('/api/auth/register', registration, 'not-a-jwt')).status).toBe(401);
    expect((await post('/api/auth/register', registration, forged)).status).toBe(401);
    expect((await post('/api/auth/register', registration, clientToken)).status).toBe(403);
    expect(admins).toHaveLength(3);
  });

  it('rejects a super admin token once that account is deactivated', async () => {
    const token = (await login(superAdmin.email, superAdmin.password)).body.accessToken;
    admins[0].active = false;

    expect((await post('/api/auth/register', registration, token)).status).toBe(403);
    expect((await login(superAdmin.email, superAdmin.password)).status).toBe(401);
    expect(admins).toHaveLength(1);
  });

  it('rejects duplicate emails, weak passwords, unknown roles and unexpected fields', async () => {
    const token = (await login(superAdmin.email, superAdmin.password)).body.accessToken;

    expect((await post('/api/auth/register', { ...registration, email: superAdmin.email }, token)).status).toBe(409);
    expect((await post('/api/auth/register', { ...registration, password: 'weak' }, token)).status).toBe(400);
    expect((await post('/api/auth/register', { ...registration, role: 'admin' }, token)).status).toBe(400);
    expect((await post('/api/auth/register', { ...registration, active: false }, token)).status).toBe(400);
    expect(admins).toHaveLength(1);
  });

  it('rejects unknown accounts and incorrect passwords without issuing tokens', async () => {
    const wrongPassword = await login(superAdmin.email, 'WrongPassword123!');
    const unknownEmail = await login('unknown@example.com', superAdmin.password);

    for (const result of [wrongPassword, unknownEmail]) {
      expect(result.status).toBe(401);
      expect(result.body.message).toBe('Invalid credentials');
      expect(result.body).not.toHaveProperty('accessToken');
    }
  });
});
