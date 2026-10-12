import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import { AuthModule } from '../src/auth/auth.module';
import { Client } from '../src/clients/entities/client.entity';

// Exercise HTTP, hashing and JWT signing without PostgreSQL or personal data.
describe('Client auth API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  const clients: Client[] = [];
  const registration = {
    email: 'client@example.com',
    password: 'ExamplePassword123!',
    firstName: 'John',
    lastName: 'Doe',
    ssn: '123-45-6789',
    dateOfBirth: '1990-05-15',
    phoneNumber: '202-456-1111',
  };
  const repository = {
    create: (data: Partial<Client>) => Object.assign(new Client(), data),
    save: async (client: Client) => {
      const saved = Object.assign(client, {
        clientId: String(clients.length + 1),
        accountBalance: '0',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      clients.push(saved);
      return saved;
    },
    findOne: async ({ where }: { where: Partial<Client> }) =>
      clients.find((client) => Object.entries(where).every(([key, value]) => client[key as keyof Client] === value)) ?? null,
    findOneByOrFail: async ({ clientId }: { clientId: string }) => {
      const client = clients.find((entry) => entry.clientId === clientId);
      if (!client) throw new Error('Client fixture not found');
      return client;
    },
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({
        JWT_SECRET: 'client-e2e-secret-with-at-least-32-characters',
        JWT_EXPIRATION: '15m',
      }))
      .overrideProvider(getRepositoryToken(Client))
      .useValue(repository)
      .compile();

    app = fixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    jwt = fixture.get(JwtService);
  });

  beforeEach(() => {
    clients.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  it('registers a client, stores a bcrypt hash, and returns a verifiable login JWT', async () => {
    const registered = await post('/auth/register', registration);

    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({ clientId: '1', email: registration.email, accountBalance: '0' });
    expect(registered.body).not.toHaveProperty('passwordHash');
    expect(registered.body).not.toHaveProperty('ssn');
    expect(bcrypt.getRounds(clients[0].passwordHash)).toBe(12);
    expect(await bcrypt.compare(registration.password, clients[0].passwordHash)).toBe(true);

    const login = await post('/auth/login', { email: registration.email, password: registration.password });
    expect(login.status).toBe(201);
    expect(await jwt.verifyAsync(login.body.accessToken, { algorithms: ['HS256'] }))
      .toMatchObject({ sub: registered.body.clientId, email: registration.email });
  });

  it('rejects duplicate client email and SSN with conflict responses', async () => {
    expect((await post('/auth/register', registration)).status).toBe(201);

    const emailConflict = await post('/auth/register', { ...registration, ssn: '234-56-7890' });
    const ssnConflict = await post('/auth/register', { ...registration, email: 'another@example.com' });

    expect(emailConflict.status).toBe(409);
    expect(ssnConflict.status).toBe(409);
    expect(clients).toHaveLength(1);
  });

  it('rejects unknown accounts and incorrect passwords without issuing tokens', async () => {
    expect((await post('/auth/register', registration)).status).toBe(201);

    const wrongPassword = await post('/auth/login', { email: registration.email, password: 'WrongPassword123!' });
    const unknownEmail = await post('/auth/login', { email: 'unknown@example.com', password: registration.password });

    for (const result of [wrongPassword, unknownEmail]) {
      expect(result.status).toBe(401);
      expect(result.body.message).toBe('Invalid credentials');
      expect(result.body).not.toHaveProperty('accessToken');
    }
  });

  it('rejects invalid registration and unexpected fields before persisting', async () => {
    const weakPassword = await post('/auth/register', { ...registration, password: 'weak' });
    const extraField = await post('/auth/register', { ...registration, roles: ['super_admin'] });

    expect(weakPassword.status).toBe(400);
    expect(extraField.status).toBe(400);
    expect(clients).toHaveLength(0);
  });
});
