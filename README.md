# Group-12-Auth

NestJS authentication service for the Group 12 capstone project.

## Overview

This service handles client registration, password hashing, and JWT issuance for the platform. It is built with NestJS and TypeORM, and it persists client records in PostgreSQL. The service is focused on authentication and token generation; authorization and protected-resource validation are expected to be handled by downstream services.

## Current architecture

The live codebase is organized as follows:

- `AppModule`
  - loads environment variables from a project-level `.env`
  - configures the TypeORM PostgreSQL connection
  - imports `ClientsModule` and `AuthModule`

- `ClientsModule`
  - manages the `Client` entity and repository access
  - exposes a basic health endpoint at `GET /users/health`

- `AuthModule`
  - provides the registration and login flows
  - configures `JwtModule` with `HS256` signing
  - uses `JWT_SECRET` and `JWT_EXPIRATION` from environment variables

- `Client` entity
  - stores client profile information, including:
    - `clientId`
    - `firstName`
    - `lastName`
    - `email`
    - `passwordHash`
    - `ssn`
    - `phoneNumber`
    - `dateOfBirth`
    - `accountBalance`
    - `createdAt`

## Project structure

```text
src/
├── app.module.ts
├── main.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   └── dto/
│       ├── login.dto.ts
│       └── register.dto.ts
├── clients/
│   ├── clients.controller.ts
│   ├── clients.module.ts
│   ├── clients.service.ts
│   └── entities/
│       └── client.entity.ts
└── ...
test/
└── auth.e2e-spec.ts
```

## Prerequisites

- Node.js 18+
- npm
- PostgreSQL instance running locally or in a container

## Environment configuration

Create a `.env` file in the project root and add the required variables for your local environment. The application reads this file globally via `ConfigModule.forRoot({ envFilePath: '.env' })`.

Example structure:

```env
PORT=3000
DATABASE_TYPE=postgres
DATABASE_HOST=your_database_host
DATABASE_PORT=5432
DATABASE_USERNAME=your_database_user
DATABASE_PASSWORD=your_database_password
DATABASE_NAME=your_database_name
JWT_EXPIRATION=3600s
JWT_SECRET=your_secure_jwt_secret
```

Use your own secure values for the database connection and signing secret; do not commit real credentials to source control.

## Install dependencies

```bash
npm install
```

## Run the service

Development mode:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start
```

The app listens on the port from `PORT` (default `3000`).

## API endpoints

### `POST /auth/register`

Creates a new client record after validating the payload and hashing the password.

Request body:

```json
{
  "email": "user@example.com",
  "password": "ExamplePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "ssn": "123-45-6789",
  "dateOfBirth": "2000-01-15",
  "phoneNumber": "202-456-1111"
}
```

Validation rules:
- `email` must be a valid email
- `password` must be at least 12 characters and include uppercase, lowercase, number, and special character
- `ssn` must match `123-45-6789`
- `dateOfBirth` must be a valid ISO date string
- `phoneNumber` must be a valid US phone number

Example success response:

```json
{
  "clientId": "123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "202-456-1111",
  "dateOfBirth": "2000-01-15",
  "accountBalance": "0",
  "createdAt": "2026-10-05T00:00:00.000Z"
}
```

The response intentionally omits:
- `passwordHash`
- `ssn`

### `POST /auth/login`

Authenticates a client by email and password, then issues a JWT.

Request body:

```json
{
  "email": "user@example.com",
  "password": "ExamplePassword123!"
}
```

Example successful response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

## JWT behavior

The service currently issues JWTs using the `HS256` algorithm.

Token payload includes:

- `sub` — client ID
- `email` — client email

The JWT is signed using `JWT_SECRET` and expires according to `JWT_EXPIRATION`.

Important: this implementation does not use RSA public/private keys or asymmetric JWT verification. It is a symmetric signing flow.

## Security notes

- Passwords are hashed with `bcryptjs` before being stored.
- Password hashes are never returned in API responses.
- SSNs are unique and excluded from returned payloads.
- The application does not expose a JWT validation or authorization guard in this service.
- Authorization decisions should be enforced by the consuming application or downstream API layer.

## Testing

```bash
npm test
```

The test suite includes an end-to-end auth flow covering:
- client registration
- login
- JWT generation
- validation of the signed token payload

## Notes

This project is a focused authentication microservice for the Group 12 platform. It handles:
- registration
- validation
- password hashing
- JWT issuance

It does not currently implement application-level authorization checks or token validation logic beyond generating signed tokens.
