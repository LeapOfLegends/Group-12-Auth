# Group-12-Auth

NestJS authentication for the trading platform, backed by the shared PostgreSQL database. It handles client registration and login, admin login for every role, and admin registration by super admins. Login returns an HS256 JWT signed with `JWT_SECRET`. Spring Boot verifies that token with the same secret and reads the `role` claim to decide which data an admin may access.

Use Postman to call the endpoints. There is no Swagger setup in this repository.

## Application structure

The admin code mirrors the client code. `ClientsService` and `AdminsService` own database access to the `clients` and `admins` tables. `AuthService` and `AdminAuthService` do the bcrypt and JWT work on top of them. The only addition on the admin side is `SuperAdminGuard`, which protects admin registration.

```text
src/
  auth/                 client register + login      POST /auth/register, POST /auth/login
  clients/              clients table access, GET /users/health
  admin-auth/           admin register + login       POST /api/auth/register, POST /api/auth/login
    super-admin.guard.ts
    dto/
  admins/               admins table access, AdminRole enum, Admin entity
test/
  auth.e2e-spec.ts
  admin-auth.e2e-spec.ts
postman/
  Group-12-Auth.postman_collection.json
```

Roles are `super_admin`, `operations` and `finance`. They live in the `roles` column of the `admins` table, one role per admin.

## Configuration and startup

Copy [.env.example](.env.example) to `.env` and fill in the existing database connection and the JWT secret shared with Spring Boot:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=15432
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
JWT_SECRET=replace_with_a_long_random_signing_secret
JWT_EXPIRATION=3600s
```

Then:

```bash
npm install
npm run start:dev
```

The service uses the existing tables with TypeORM `synchronize: false`. It does not create or migrate tables, and it does not seed accounts. A super admin must already exist in the `admins` table with a bcrypt password hash.

## Admin endpoints

### Login (any role)

`POST /api/auth/login`

```json
{
  "email": "super@admin.com",
  "password": "<password>"
}
```

Returns HTTP 200:

```json
{
  "accessToken": "<JWT>",
  "admin": {
    "adminId": "60",
    "firstName": "Super",
    "lastName": "Admin",
    "email": "super@admin.com",
    "role": "super_admin",
    "active": true,
    "createdAt": "2026-10-01T00:00:00.000Z",
    "updated": "2026-10-01T00:00:00.000Z"
  }
}
```

The JWT payload is `{ "sub": "<adminId>", "email": "...", "role": "super_admin" | "operations" | "finance", "iat": ..., "exp": ... }`. Password hashes are never returned. Unknown emails, wrong passwords and inactive accounts all get HTTP 401 `Invalid credentials`.

### Register (super admins only)

`POST /api/auth/register` with header `Authorization: Bearer <super admin accessToken>`

```json
{
  "firstName": "Alex",
  "lastName": "Admin",
  "email": "alex@admin.com",
  "password": "StrongPassword123!",
  "role": "operations"
}
```

`role` must be `super_admin`, `operations` or `finance`. Passwords need at least 12 characters with an uppercase letter, a lowercase letter, a number and a special character, the same rule as client registration. Returns HTTP 201 with the new admin in the same shape as the login response's `admin` object. The new admin can log in immediately.

| Status | Meaning |
| --- | --- |
| 400 | Invalid body: bad email, weak password, unknown role, or unexpected fields |
| 401 | Missing, invalid or expired Bearer token |
| 403 | Token belongs to an operations or finance admin, a client, or a super admin that has since been deactivated |
| 409 | An admin with this email already exists |

The guard verifies the token signature, requires `role` to be `super_admin`, and then re-reads the admin from the database so a deactivated or demoted super admin cannot keep using an old token.

## Client endpoints

`POST /auth/register` creates a client (email, password, firstName, lastName, ssn, dateOfBirth, phoneNumber) and returns the client without the password hash or SSN. `POST /auth/login` returns `{ "accessToken": "<JWT>" }` with `sub` and `email` claims. `GET /users/health` returns `{ "status": "ok" }`.

## Tests

```bash
npm test
```

Both specs start a real Nest HTTP server with in-memory repositories, so they need no database. They cover login for all three roles, registration of all three roles by a super admin, rejection of operations, finance, client, missing and forged tokens, deactivated super admins, duplicate emails and validation.

## Manual testing with Postman

**Start the service.** It listens on the `PORT` from `.env`, which is 3000 by default.

```bash
npm install
npm run start:dev
```

**Know a super admin password.** Only admins whose `password_hash` is a bcrypt hash can log in. To set a password on an existing super admin, generate a hash:

```bash
node -e "require('bcrypt').hash(process.argv[1], 12).then(console.log)" "YourPassword123!"
```

Then store it with your SQL client:

```sql
UPDATE admins SET password_hash = '<hash from the command>' WHERE email = 'super@admin.com';
```

**Use the collection.** Import [Group-12-Auth.postman_collection.json](postman/Group-12-Auth.postman_collection.json), open its Variables tab, and fill in `superAdminEmail`, `superAdminPassword`, `newAdminEmail`, `newAdminPassword` and `newAdminRole`. Run the requests top to bottom. Request 1 saves the super admin token and request 2 sends it automatically.

**Or send the requests yourself.** Every request uses the header `Content-Type: application/json`. Registration also needs `Authorization: Bearer <accessToken>` from the super admin login, which in Postman is the Authorization tab with type Bearer Token.

| Step | Request | Body |
| --- | --- | --- |
| Super admin login | `POST /api/auth/login` | `{ "email": "super@admin.com", "password": "YourPassword123!" }` |
| Register an admin | `POST /api/auth/register` | `{ "firstName": "Alex", "lastName": "Admin", "email": "alex@admin.com", "password": "StrongPassword123!", "role": "operations" }` |
| New admin login | `POST /api/auth/login` | `{ "email": "alex@admin.com", "password": "StrongPassword123!" }` |
| Client register | `POST /auth/register` | `{ "email": "jane@example.com", "password": "ClientPassword123!", "firstName": "Jane", "lastName": "Doe", "ssn": "123-45-6789", "dateOfBirth": "1990-05-15", "phoneNumber": "202-456-1111" }` |
| Client login | `POST /auth/login` | `{ "email": "jane@example.com", "password": "ClientPassword123!" }` |
| Health | `GET /users/health` | none |

Expect 200 for admin logins, 201 for registrations and client login, 401 for a wrong password or a missing token, 403 when an operations or finance token is used to register, and 409 for an email that already exists.

## Live endpoint check (October 12, 2026)

Every endpoint was called against the built server and the live PostgreSQL database. Because existing passwords are unknown, the check inserted a temporary super admin with a random password, then deleted every row it created. Admin and client row counts were unchanged afterward and no existing account or table was modified.

| Request | Result |
| --- | --- |
| GET /users/health | 200 |
| POST /auth/register, then /auth/login as the new client | 201, then 201 with a JWT |
| Client duplicate email or SSN, weak password | 409, 409, 400 |
| Client wrong password or unknown email | 401 |
| POST /api/auth/login as super admin (mixed-case email) | 200, JWT with `role: super_admin`, no password hash |
| Admin wrong password, inactive account, seed account without bcrypt hash, bad body | 401, 401, 401, 400 |
| Super admin registers super_admin, operations and finance admins | 201 each, bcrypt hashes stored |
| Each new admin logs in | 200 with its own role |
| Newly registered super admin registers an admin | 201 |
| Operations or finance admin tries to register | 403 |
| No token, garbage token, client token | 401, 401, 403 |
| Super admin deactivated after logging in | 403 |
| Duplicate email in different case, unknown role, weak password, extra field | 409, 400, 400, 400 |
| GET /api/auth/admins | 404 (no such route) |

Most seeded admin rows hold placeholder values instead of bcrypt hashes, so they cannot log in until their passwords are reset.
