import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Client } from '../src/clients/entities/client.entity';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let clientsRepository: Repository<Client>;
  let jwtService: JwtService;
  let keyDirectory: string;
  let publicKey: string;
  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  const email = `auth-test-${uniqueSuffix}@example.com`;
  const ssn = `${uniqueSuffix.slice(0, 3)}-${uniqueSuffix.slice(3, 5)}-${uniqueSuffix.slice(5)}`;

  beforeAll(async () => {
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyDirectory = mkdtempSync(join(tmpdir(), 'group-12-auth-'));
    const privateKeyPath = join(keyDirectory, 'jwt-private.pem');
    writeFileSync(privateKeyPath, keyPair.privateKey);
    publicKey = keyPair.publicKey;

    const previousKeyPath = process.env.JWT_PRIVATE_KEY_PATH;
    process.env.JWT_PRIVATE_KEY_PATH = privateKeyPath;
    let moduleFixture: TestingModule;
    try {
      moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
    } finally {
      if (previousKeyPath === undefined) {
        delete process.env.JWT_PRIVATE_KEY_PATH;
      } else {
        process.env.JWT_PRIVATE_KEY_PATH = previousKeyPath;
      }
    }

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    clientsRepository = moduleFixture.get<Repository<Client>>(getRepositoryToken(Client));
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    if (clientsRepository && app) {
      await clientsRepository.delete({ email });
    }
    if (app) {
      await app.close();
    }
    if (keyDirectory) {
      rmSync(keyDirectory, { recursive: true, force: true });
    }
  });

  it('registers a client and authenticates it with a JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'ExamplePassword123!',
        firstName: 'John',
        lastName: 'Doe',
        ssn,
        dateOfBirth: '1990-05-15',
        phoneNumber: '202-456-1111',
      })
      .expect(201);

    expect(response.body).toHaveProperty('clientId');
    expect(response.body.email).toBe(email);
    expect(Number(response.body.accountBalance)).toBe(0);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('ssn');

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'ExamplePassword123!' })
      .expect(201);
    const token = loginResponse.body.accessToken;
    const decodedToken = jwtService.decode(token, { complete: true }) as {
      header: { alg: string };
    };
    expect(decodedToken.header.alg).toBe('RS256');

    const tokenPayload = await jwtService.verifyAsync(token, {
      publicKey,
      algorithms: ['RS256'],
    });

    expect(tokenPayload.sub).toBe(response.body.clientId);
    expect(tokenPayload.email).toBe(email);

    await expect(
      jwtService.verifyAsync(token, {
        publicKey,
        algorithms: ['HS256'],
      }),
    ).rejects.toThrow();

    const wrongKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    await expect(
      jwtService.verifyAsync(token, {
        publicKey: wrongKeyPair.publicKey,
        algorithms: ['RS256'],
      }),
    ).rejects.toThrow();
  });
});
