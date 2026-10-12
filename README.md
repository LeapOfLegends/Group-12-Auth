# Group-12-Auth

NestJS login service for the trading platform, backed by the shared PostgreSQL database. It does one thing: `POST /auth/login` checks an email and password against the `admins` or `clients` table and returns an HS256 JWT signed with `JWT_SECRET`. Accounts are created elsewhere. The Spring Boot backend (Group-12-Backend) registers admins, hashes their passwords and verifies this service's tokens with the same secret.

Use Postman to call the endpoints. There is no Swagger setup in this repository.

## How login tells admins and clients apart

The email domain picks the table. Domains listed in `ADMIN_EMAIL_DOMAINS` (default `admin.com,fmr.com`) are looked up in `admins`; every other domain is looked up in `clients`. There is no fall-through: an unknown email or a wrong password gets HTTP 401 `Invalid credentials`, and a client row with an admin-domain email can never log in.

Admin emails are matched trimmed and in lowercase because the backend stores them that way. Client emails are matched exactly as stored.

## Application structure

```text
src/
  auth/        POST /auth/login          AuthController, AuthService, LoginDto
  admins/      admins table access       Admin entity, AdminRole enum, AdminsService
  clients/     clients table access      Client entity, ClientsService, GET /users/health
test/
  auth.e2e-spec.ts
postman/
  Group-12-Auth.postman_collection.json
```

Roles are `super_admin`, `operations` and `finance`. They live in the `roles` column of the `admins` table, one role per admin.

## Configuration and startup

Copy [.env.example](.env.example) to `.env` and fill in the database connection and the values shared with Spring Boot:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=15432
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=capstone2026
JWT_SECRET=replace_with_a_long_random_signing_secret_of_32_or_more_characters
JWT_EXPIRATION=3600s
ADMIN_EMAIL_DOMAINS=admin.com,fmr.com
```

`JWT_SECRET` and `ADMIN_EMAIL_DOMAINS` must be identical in Group-12-Backend. The secret must be at least 32 characters, or the backend rejects every token.

```bash
npm install
npm run start:dev
```

The service uses the existing tables with TypeORM `synchronize: false`. It does not create or migrate tables, and it does not seed accounts.

## Login

`POST /auth/login`

```json
{
  "email": "super@admin.com",
  "password": "<password>"
}
```

For an admin-domain email, HTTP 200 with the admin and a token that carries the role:

```json
{
  "accessToken": "<JWT>",
  "admin": {
    "adminId": "60",
    "firstName": "Super",
    "lastName": "Admin",
    "email": "super@admin.com",
    "role": "super_admin",
    "createdAt": "2026-10-01T00:00:00.000Z"
  }
}
```

The JWT payload is `{ "sub": "<adminId>", "email": "...", "role": "super_admin" | "operations" | "finance", "iat": ..., "exp": ... }`. Spring Boot reads `role` to decide what the admin may do.

For any other email, HTTP 200 with the client (no password hash, no SSN) and a token whose payload is `{ "sub": "<clientId>", "email": "...", "roles": ["CLIENT"], "iat": ..., "exp": ... }`:

```json
{
  "accessToken": "<JWT>",
  "client": {
    "clientId": "12",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phoneNumber": "202-456-1111",
    "dateOfBirth": "1990-05-15",
    "accountBalance": "0",
    "createdAt": "2026-10-01T00:00:00.000Z"
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid body: bad email, missing password, or unexpected fields |
| 401 | Unknown email or wrong password |

Password hashes are never returned.

## Creating accounts

- **Admins**: `POST /admins` on Group-12-Backend with a super admin's `accessToken` as `Authorization: Bearer <token>`. The backend hashes the password with bcrypt, stores the email lowercase and rejects emails outside `ADMIN_EMAIL_DOMAINS`. The new admin can log in here right away. See the backend README for the request body and error codes.
- **Clients**: created by Group-12-Backend. A client can only log in once its `password_hash` holds a bcrypt hash.

## Tests

```bash
npm test
```

The spec starts a real Nest HTTP server with in-memory tables, so it needs no database. It covers login for all three roles and for clients, the role claim, domain routing, case-insensitive admin emails, both bcrypt prefixes, wrong passwords, unknown emails, body validation and the absence of registration routes.

## Manual testing with Postman

**Start both services.** This one listens on the `PORT` from `.env` (3000 by default); the backend listens on 8081.

**Know a super admin password.** Only admins whose `password_hash` is a bcrypt hash can log in. To set a password on an existing super admin, generate a hash:

```bash
node -e "require('bcrypt').hash(process.argv[1], 12).then(console.log)" "YourPassword123!"
```

Then store it with your SQL client:

```sql
UPDATE admins SET password_hash = '<hash from the command>' WHERE email = 'super@admin.com';
```

**Use the collection.** Import [Group-12-Auth.postman_collection.json](postman/Group-12-Auth.postman_collection.json), open its Variables tab, and fill in `superAdminEmail`, `superAdminPassword`, `newAdminEmail` (admin domain), `newAdminPassword`, `newAdminRole`, `clientEmail` and `clientPassword`. Run the requests top to bottom. Request 1 saves the super admin token, request 2 registers an admin through the backend with it, and request 3 logs that admin in here.

| Step | Request | Body |
| --- | --- | --- |
| Super admin login | `POST {{baseUrl}}/auth/login` | `{ "email": "super@admin.com", "password": "YourPassword123!" }` |
| Register an admin (backend) | `POST {{backendUrl}}/admins` + Bearer token | `{ "firstName": "Alex", "lastName": "Admin", "email": "alex@admin.com", "password": "StrongPassword123!", "role": "operations" }` |
| New admin login | `POST {{baseUrl}}/auth/login` | `{ "email": "alex@admin.com", "password": "StrongPassword123!" }` |
| Client login | `POST {{baseUrl}}/auth/login` | `{ "email": "jane@example.com", "password": "ClientPassword123!" }` |
| Health | `GET {{baseUrl}}/users/health` | none |

Expect 200 for logins, 201 for the registration, 401 for a wrong password or a missing token, 403 when an operations or finance token is used to register, and 409 for an admin email that already exists.
