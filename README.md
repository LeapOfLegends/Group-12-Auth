# Group-12-Auth

NestJS = Authentication + User Registration + JWT Issuance

Spring Boot = JWT Validation + Authorization + Application APIs

## Overview

This service handles user registration, validation, hashing, and JWT issuance for the Group 12 platform. It is designed to be used by a separate Spring Boot application that validates the JWTs on protected endpoints and enforces authorization there.

This NestJS service does not implement JWT guard logic on protected application routes. Its responsibility is limited to issuing signed JWTs for downstream authenticated requests.

## Architecture

The service is organized into:

- `AuthModule` for login, registration, and JWT issuance
- `UsersModule` for persistence and user lookup
- `User` entity for secure data storage and uniqueness constraints
- JWT config driven from environment variables

## Install dependencies

```bash
npm install
```

## Configure environment variables

Create a `.env` file from `.env.example` and fill in the values required by the app.

```bash
cp .env.example .env
```

Example:

```env
PORT=3000
DATABASE_TYPE=sqlite
DATABASE_NAME=./auth.db
JWT_EXPIRATION=3600s
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
```

Do not commit real private keys or credentials.

## Generate RSA keys

On a local machine, generate a keypair and place the private key in the local `.env` file. The public key is used by the Spring Boot app for JWT verification.

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Then paste the contents into the `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` variables in the `.env` file.

## Start the NestJS service

```bash
npm run start:dev
```

The app listens on the port specified by `PORT` (default `3000`).

## Available endpoints

### POST /auth/register

Registers a new user.

Request body:

```json
{
  "email": "user@example.com",
  "password": "ExamplePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "ssn": "123-45-6789",
  "dateOfBirth": "2000-01-15",
  "phoneNumber": "555-123-4567"
}
```

### POST /auth/login

Authenticates a user and returns a JWT.

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
  "accessToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

## JWT behavior

JWTs are signed with RS256 and contain only minimal claims:

- `sub` — user ID
- `email` — user email
- `iat` — issued-at
- `exp` — expiration

The JWT does not include:

- SSN
- password
- password hash
- date of birth
- phone number

## Spring Boot validation

The Spring Boot service should validate JWT signatures using the public key, confirm token expiration, and extract claims such as user ID and email before authorizing requests on protected endpoints.

The expected pattern is:

1. NestJS issues a JWT using the private key
2. Spring Boot receives the JWT
3. Spring Boot verifies the RS256 signature with the public key
4. Spring Boot checks `exp`
5. Spring Boot authorizes access based on the validated claims

## Sensitive field protection

Sensitive information is protected as follows:

- Passwords are hashed before persistence
- Password hashes are never returned to clients
- SSNs are unique, stored securely, and never returned in JWTs or normal API responses
- SSNs are never logged
- JWTs do not contain SSN or other unnecessary personal information

## Notes

This project is intentionally focused on authentication and token issuance. Authorization and JWT validation are expected to happen in the Spring Boot service instead of in NestJS.
