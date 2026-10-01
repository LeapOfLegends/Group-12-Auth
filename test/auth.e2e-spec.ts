import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Client } from '../src/clients/entities/client.entity';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let clientsRepository: Repository<Client>;
  let jwtService: JwtService;
  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  const email = `auth-test-${uniqueSuffix}@example.com`;
  const ssn = `${uniqueSuffix.slice(0, 3)}-${uniqueSuffix.slice(3, 5)}-${uniqueSuffix.slice(5)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    if (clientsRepository) {
      await clientsRepository.delete({ email });
    }
    await app.close();
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
    const tokenPayload = await jwtService.verifyAsync(loginResponse.body.accessToken, {
      algorithms: ['HS256'],
    });

    expect(tokenPayload.sub).toBe(response.body.clientId);
    expect(tokenPayload.email).toBe(email);
  });
});
