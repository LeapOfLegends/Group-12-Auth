import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AdminRole } from '../src/admins/admin-role.enum';
import { Admin } from '../src/admins/entities/admin.entity';
import { AuthModule } from '../src/auth/auth.module';
import { Client } from '../src/clients/entities/client.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';

// Exercises HTTP registration, bcrypt verification and JWT signing without PostgreSQL.
describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let passwordHash: string;
  const PASSWORD = 'ExamplePassword123!';
  const admins: Admin[] = [];
  const clients: Client[] = [];
  const refreshTokens: RefreshToken[] = [];

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
        ADMIN_EMAIL_DOMAINS: 'admin.com',
      }))
      .overrideProvider(getRepositoryToken(Admin))
      .useValue(table(admins))
      .overrideProvider(getRepositoryToken(Client))
      .useValue({
        ...table(clients),
        create: (data: Partial<Client>) => Object.assign(new Client(), data),
        save: async (client: Client) => {
          client.clientId = String(clients.length + 1);
          client.accountBalance = '0';
          client.createdAt = new Date();
          clients.push(client);
          return client;
        },
        findOneByOrFail: async ({ clientId }: { clientId: string }) => {
          const client = clients.find((row) => row.clientId === clientId);
          if (!client) throw new Error('Client not found');
          return client;
        },
      })
      .overrideProvider(getRepositoryToken(RefreshToken))
      .useValue({
        findOne: async ({ where }: { where: Partial<RefreshToken> }) =>
          refreshTokens.find((row) => Object.entries(where).every(([key, value]) => row[key as keyof RefreshToken] === value)) ?? null,
        create: (data: Partial<RefreshToken>) => Object.assign(new RefreshToken(), data),
        save: async (token: RefreshToken) => {
          refreshTokens.push(token);
          return token;
        },
        update: async ({ tokenHash }: { tokenHash: string }, values: Partial<RefreshToken>) => {
          const token = refreshTokens.find(
            (row) => row.tokenHash === tokenHash && row.expiresAt.getTime() > Date.now(),
          );
          if (!token) return { affected: 0 };
          Object.assign(token, values);
          return { affected: 1 };
        },
        delete: async ({ accountType, accountId, tokenHash }: Partial<RefreshToken>) => {
          const remaining = refreshTokens.filter((row) => tokenHash
            ? row.tokenHash !== tokenHash
            : row.accountType !== accountType || row.accountId !== accountId);
          const affected = refreshTokens.length - remaining.length;
          refreshTokens.splice(0, refreshTokens.length, ...remaining);
          return { affected };
        },
      })
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
    refreshTokens.length = 0;
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

  async function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
  const cookieToken = (setCookie: string | null) => setCookie?.match(/(?:^|,\s*)refreshToken=([^;]+)/)?.[1];

  const login = (email: string, password = PASSWORD) => post('/auth/login', { email, password });

  const registration = () => ({
    email: 'new.client@example.org',
    password: PASSWORD,
    firstName: 'Jane',
    lastName: 'Doe',
    ssn: '987-65-4321',
    phoneNumber: '+12024561111',
    dateOfBirth: '1990-05-15',
  });

  it('registers a client with a bcrypt password and lets them log in', async () => {
    const body = registration();

    const result = await post('/auth/register', body);

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      clientId: '1',
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      accountBalance: '0',
    });
    for (const field of ['password', 'passwordHash', 'ssn', 'role', 'roles']) {
      expect(result.body).not.toHaveProperty(field);
    }
    expect(clients).toHaveLength(1);
    expect(admins).toHaveLength(0);
    expect(clients[0].ssn).toBe(body.ssn);
    expect(clients[0].passwordHash).not.toBe(body.password);
    expect(await bcrypt.compare(body.password, clients[0].passwordHash)).toBe(true);

    const signedIn = await login(body.email);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.client.clientId).toBe(result.body.clientId);
    expect(await jwt.verifyAsync(signedIn.body.accessToken, { algorithms: ['HS256'] }))
      .toMatchObject({ sub: '1', email: body.email, roles: ['CLIENT'] });
  });

  it.each([
    ['client@admin.com', 'admin.com'],
    ['  Client@ADMIN.COM  ', 'admin.com'],
    ['"client@other.com"@admin.com', 'admin.com'],
  ])('rejects reserved registration email %s without creating an account', async (email, domain) => {
    const result = await post('/auth/register', { ...registration(), email });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Bad Request');
    expect(result.body.message).toMatch(/client registration/i);
    expect(result.body.message).toContain(domain);
    expect(clients).toHaveLength(0);
    expect(admins).toHaveLength(0);
  });

  it.each(['client@notadmin.com', 'client@admin.com.example.org', 'client@admin.com.au'])(
    'allows ordinary client domain %s',
    async (email) => {
      const result = await post('/auth/register', { ...registration(), email });

      expect(result.status).toBe(201);
      expect(result.body.email).toBe(email);
      expect(clients).toHaveLength(1);
    },
  );

  it('uses the final domain when registering and logging in a quoted email address', async () => {
    const email = '"client@admin.com@other"@example.org';

    expect((await post('/auth/register', { ...registration(), email })).status).toBe(201);

    const result = await login(email);
    expect(result.status).toBe(200);
    expect(result.body.client.email).toBe(email);
    expect(result.body).not.toHaveProperty('admin');
  });

  it.each(['email', 'ssn'] as const)('rejects an already registered %s', async (field) => {
    const existing = seedClient();
    const body = { ...registration(), [field]: existing[field] };

    const result = await post('/auth/register', body);

    expect(result.status).toBe(409);
    expect(result.body.message).toMatch(new RegExp(field, 'i'));
    expect(clients).toHaveLength(1);
  });

  it('validates registration fields before creating an account', async () => {
    const result = await post('/auth/register', {
      email: 'not-an-email',
      password: 'weak',
      firstName: '',
      ssn: '123',
      phoneNumber: 'invalid',
      dateOfBirth: 'not-a-date',
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toEqual(expect.arrayContaining([
      expect.stringMatching(/email/i),
      expect.stringMatching(/password/i),
      expect.stringMatching(/firstName/i),
      expect.stringMatching(/lastName/i),
      expect.stringMatching(/ssn/i),
      expect.stringMatching(/phone/i),
      expect.stringMatching(/dateOfBirth/i),
    ]));
    expect(clients).toHaveLength(0);
  });

  it('rejects a password login would refuse and values too long for the clients table', async () => {
    const result = await post('/auth/register', {
      ...registration(),
      password: `${PASSWORD}${'a'.repeat(54)}`,
      firstName: 'J'.repeat(101),
      phoneNumber: '(202) 456-1111',
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toEqual(expect.arrayContaining([
      'password must be shorter than or equal to 72 characters',
      'firstName must be shorter than or equal to 100 characters',
      'phoneNumber must be shorter than or equal to 12 characters',
    ]));
    expect(clients).toHaveLength(0);
  });

  it('rejects attempts to choose a role during client registration', async () => {
    const result = await post('/auth/register', { ...registration(), role: 'super_admin' });

    expect(result.status).toBe(400);
    expect(result.body.message).toContain('property role should not exist');
    expect(clients).toHaveLength(0);
    expect(admins).toHaveLength(0);
  });

  it.each([AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE])(
    'logs in a %s admin and returns a JWT carrying uppercase roles',
    async (role) => {
      seedAdmin({ role });

      const result = await login('super@admin.com');

      expect(result.status).toBe(200);
      expect(result.body.admin).toMatchObject({ adminId: '1', email: 'super@admin.com', role });
      expect(result.body.admin).not.toHaveProperty('passwordHash');
      expect(result.body).not.toHaveProperty('client');
      expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
        .toMatchObject({ sub: '1', email: 'super@admin.com', roles: role.toUpperCase() });
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

  it('issues a signed refresh JWT, stores only its hash, and sets an HttpOnly cookie on login', async () => {
    seedClient();

    const result = await login('jane@example.com');
    const refreshPayload = await jwt.verifyAsync(result.body.refreshToken, { algorithms: ['HS256'] });
    const stored = refreshTokens[0];
    const setCookie = result.headers.get('set-cookie');

    expect(result.body.refreshToken).toEqual(expect.any(String));
    expect(refreshPayload).toMatchObject({ sub: '1', accountType: 'client' });
    expect(stored).toMatchObject({ tokenHash: hashToken(result.body.refreshToken), accountType: 'client', accountId: '1' });
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/auth');
    expect(setCookie).toContain('SameSite=Lax');
    expect(cookieToken(setCookie)).toBe(result.body.refreshToken);
  });

  it('accepts a refresh token from the body and rotates its hash and expiry', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');
    const oldRefreshToken = signedIn.body.refreshToken;
    const oldExpiry = refreshTokens[0].expiresAt.getTime();

    const result = await post('/auth/refresh', { refreshToken: oldRefreshToken });

    expect(result.status).toBe(200);
    expect(result.body.accessToken).toEqual(expect.any(String));
    expect(result.body.refreshToken).toEqual(expect.any(String));
    expect(result.body.refreshToken).not.toBe(oldRefreshToken);
    expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
      .toMatchObject({ sub: '1', email: 'jane@example.com', roles: ['CLIENT'] });
    expect(refreshTokens).toHaveLength(1);
    expect(refreshTokens[0].tokenHash).toBe(hashToken(result.body.refreshToken));
    expect(refreshTokens[0].tokenHash).not.toBe(hashToken(oldRefreshToken));
    expect(refreshTokens[0].expiresAt.getTime()).toBeGreaterThan(oldExpiry);
    expect(cookieToken(result.headers.get('set-cookie'))).toBe(result.body.refreshToken);
  });

  it('accepts the HttpOnly cookie without a body token and replaces the cookie after rotation', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');
    const oldRefreshToken = signedIn.body.refreshToken;

    const result = await post('/auth/refresh', undefined, { Cookie: `refreshToken=${oldRefreshToken}` });

    expect(result.status).toBe(200);
    expect(cookieToken(result.headers.get('set-cookie'))).toBe(result.body.refreshToken);
    expect(result.body.refreshToken).not.toBe(oldRefreshToken);
  });

  it('rejects a refresh JWT after it has been rotated', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');
    await post('/auth/refresh', { refreshToken: signedIn.body.refreshToken });

    const replay = await post('/auth/refresh', { refreshToken: signedIn.body.refreshToken });

    expect(replay.status).toBe(401);
  });

  it('logs out by revoking the refresh token and clearing the matching cookie', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');

    const result = await post('/auth/logout', { refreshToken: signedIn.body.refreshToken });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ message: 'Logged out' });
    expect(refreshTokens).toHaveLength(0);
    expect(result.headers.get('set-cookie')).toContain('Path=/auth');
    expect(result.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    expect((await post('/auth/refresh', { refreshToken: signedIn.body.refreshToken })).status).toBe(401);
  });

  it('logs out using the cookie and treats missing, unknown, and already revoked tokens as success', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');

    const fromCookie = await post('/auth/logout', undefined, { Cookie: `refreshToken=${signedIn.body.refreshToken}` });
    const withoutToken = await post('/auth/logout');
    const again = await post('/auth/logout', { refreshToken: signedIn.body.refreshToken });

    expect(fromCookie.status).toBe(200);
    expect(withoutToken.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.headers.get('set-cookie')).toContain('Path=/auth');
    expect(refreshTokens).toHaveLength(0);
  });

  it('replaces the account refresh token on a new login', async () => {
    seedClient();
    const firstLogin = await login('jane@example.com');
    const secondLogin = await login('jane@example.com');

    expect(refreshTokens).toHaveLength(1);
    expect(refreshTokens[0].tokenHash).toBe(hashToken(secondLogin.body.refreshToken));
    expect((await post('/auth/refresh', { refreshToken: firstLogin.body.refreshToken })).status).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: secondLogin.body.refreshToken })).status).toBe(200);
  });

  it('allows only one of two concurrent refresh attempts with the same token', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');

    const results = await Promise.all([
      post('/auth/refresh', { refreshToken: signedIn.body.refreshToken }),
      post('/auth/refresh', { refreshToken: signedIn.body.refreshToken }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
  });

  it('rejects missing, malformed, tampered, and expired refresh tokens', async () => {
    seedClient();
    const validLogin = await login('jane@example.com');
    const validToken = validLogin.body.refreshToken as string;
    const [header, payload, signature] = validToken.split('.');
    const tamperedPayload = `${payload[0] === 'a' ? 'b' : 'a'}${payload.slice(1)}`;
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
    const expiredToken = await jwt.signAsync(
      { sub: '1', accountType: 'client' },
      { expiresIn: -1 },
    );

    expect((await post('/auth/refresh')).status).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: 'not-a-jwt' })).status).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: tamperedToken })).status).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: expiredToken })).status).toBe(401);
  });

  it('rejects a validly signed refresh JWT with no matching database row', async () => {
    const unregisteredToken = await jwt.signAsync(
      { sub: '999', accountType: 'client' },
      { expiresIn: 60 },
    );

    const result = await post('/auth/refresh', { refreshToken: unregisteredToken });

    expect(result.status).toBe(401);
  });

  it('rejects a valid JWT whose matching database row has expired', async () => {
    const token = await jwt.signAsync(
      { sub: '1', accountType: 'client' },
      { expiresIn: '1h' },
    );
    refreshTokens.push(Object.assign(new RefreshToken(), {
      tokenHash: hashToken(token),
      accountType: 'client',
      accountId: '1',
      expiresAt: new Date(Date.now() - 1000),
    }));

    const result = await post('/auth/refresh', { refreshToken: token });

    expect(result.status).toBe(401);
  });

  it('rejects refresh when the account has been removed', async () => {
    seedClient();
    const signedIn = await login('jane@example.com');
    clients.length = 0;

    const result = await post('/auth/refresh', { refreshToken: signedIn.body.refreshToken });

    expect(result.status).toBe(401);
  });

  it('rotates refresh tokens for admins while preserving their current role claim', async () => {
    seedAdmin({ role: AdminRole.OPERATIONS });
    const signedIn = await login('super@admin.com');

    const result = await post('/auth/refresh', { refreshToken: signedIn.body.refreshToken });

    expect(result.status).toBe(200);
    expect(result.body.refreshToken).not.toBe(signedIn.body.refreshToken);
    expect(await jwt.verifyAsync(result.body.accessToken, { algorithms: ['HS256'] }))
      .toMatchObject({ sub: '1', email: 'super@admin.com', role: AdminRole.OPERATIONS });
  });

  it('matches admin emails case-insensitively on every configured domain', async () => {
    seedAdmin({ email: 'ops@admin.com', role: AdminRole.OPERATIONS });

    const result = await login('OPS@ADMIN.COM');

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

  it('validates login and exposes no admin registration or legacy routes', async () => {
    seedAdmin();

    expect((await post('/auth/login', { email: 'not-an-email', password: PASSWORD })).status).toBe(400);
    expect((await post('/auth/login', { email: 'super@admin.com', password: PASSWORD, role: 'super_admin' })).status).toBe(400);

    for (const path of ['/auth/admin/register', '/auth/register/admin', '/api/auth/register', '/api/auth/login']) {
      expect((await post(path, { email: 'super@admin.com', password: PASSWORD })).status).toBe(404);
    }
  });
});
