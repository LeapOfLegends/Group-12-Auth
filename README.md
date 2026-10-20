# Group-12-Auth

NestJS authentication service for the trading platform, backed by the shared PostgreSQL database. `POST /auth/register` creates client accounts. `POST /auth/login` checks an email and password against the `admins` or `clients` table and returns an HS256 JWT signed with `JWT_SECRET`. The Spring Boot backend (Group-12-Backend) registers admins, hashes their passwords and verifies this service's tokens with the same secret.

Use Postman to call the endpoints. There is no Swagger setup in this repository.

## How login tells admins and clients apart

The email domain picks the table. The `admin.com` domain is looked up in `admins`; every other domain is looked up in `clients`. There is no fall-through: an unknown email or a wrong password gets HTTP 401 `Invalid credentials`, and a client row with an admin-domain email can never log in.

Admin emails are matched trimmed and in lowercase because the backend stores them that way. Client emails are matched exactly as stored.

## Application structure

```text
src/
  auth/        POST /auth/login, /auth/register   AuthController, AuthService, LoginDto, RegisterDto
  admins/      admins table access       Admin entity, AdminRole enum, AdminsService
  clients/     clients table access      Client entity, ClientsService, GET /users/health
test/
  auth.e2e-spec.ts
postman/
  Group-12-Auth.postman_collection.json
```

Roles are `super_admin`, `operations` and `finance`. They live in the `roles` column of the `admins` table, one role per admin.

## Configuration and startup

Create `.env` with the database connection and the values shared with Spring Boot:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=15432
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=capstone2026
JWT_SECRET=replace_with_a_long_random_signing_secret_of_32_or_more_characters
JWT_EXPIRATION=3600s
REFRESH_TOKEN_EXPIRATION=2592000
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_EMAIL_DOMAINS=admin.com
```

`JWT_SECRET` and `ADMIN_EMAIL_DOMAINS` must be identical in Group-12-Backend. The secret must be at least 32 characters, or the backend rejects every token.

```bash
npm install
npm run start:dev
```

The service uses the existing tables with TypeORM `synchronize: false`. It does not create or migrate tables, and it does not seed accounts.

## Docker image

The Dockerfile packages the compiled `dist` directory. Jenkins installs dependencies, runs tests and builds the application once before creating the image on `main`. To do the same locally:

```bash
npm ci
npm test -- --runInBand
npm run build
docker build -t group-12-auth:local .
docker network inspect capstone-net >/dev/null 2>&1 || docker network create capstone-net
docker run -d --name capstone-auth --network capstone-net --env-file .env -p 3000:3000 group-12-auth:local
```

Set the database and JWT values in `.env` before starting the container. `DB_HOST` and `DB_PORT` must address a database reachable from the container; `localhost` refers to the container itself. The database must already contain the shared application tables. Use the same `JWT_SECRET` of at least 32 characters and `ADMIN_EMAIL_DOMAINS` as the backend.

The frontend proxy expects this container to be named `capstone-auth` on `capstone-net`. The Auth Jenkins pipeline creates the image; starting the Auth container is a separate step.

Use a Unix Jenkins agent with Node.js 22 or a compatible newer release, npm and a working Docker daemon. Configure a Multibranch Pipeline so the `branch 'main'` condition receives the branch metadata it needs.

## Client registration

`POST /auth/register`

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "ClientPassword123!",
  "ssn": "123-45-6789",
  "phoneNumber": "202-456-1111",
  "dateOfBirth": "1990-05-15"
}
```

Registration trims surrounding whitespace from the email. Emails on the `admin.com` domain are rejected in any letter case, because login would look them up in the `admins` table. Admin accounts are created on Group-12-Backend.

Passwords must contain 12 to 72 characters, including an uppercase letter, a lowercase letter, a number and a special character. First and last names must be nonempty strings of at most 100 characters. SSNs must use `123-45-6789` format, phone numbers must be valid US numbers of at most 12 characters (for example, `202-456-1111` or `+12024561111`), and dates of birth must be ISO 8601 dates.

HTTP 201 returns the created client directly, with the same public fields as the client shown in the login response below. Password hashes and SSNs are excluded. Registration does not return a token; use `POST /auth/login` afterward.

| Status | Meaning |
| --- | --- |
| 400 | Invalid body or an email using a reserved admin domain |
| 409 | Email or SSN already registered |

A rejected admin-domain email gets HTTP 400 with a message that names the domain, for example `Client registration does not accept emails ending in @admin.com; this domain is reserved for admins.`

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
  "refreshToken": "<opaque refresh token>",
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
  "refreshToken": "<opaque refresh token>",
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

Refresh tokens are signed HS256 JWTs. The service stores only their SHA-256 hashes in the existing `refresh_tokens` table, with an expiry in `expires_at`. Each account has one active refresh token; a successful new login replaces the previous one. `REFRESH_TOKEN_EXPIRATION` controls lifetime in seconds and defaults to 30 days.

Login and refresh also set the `refreshToken` cookie as HttpOnly, with its path limited to `/auth` and its lifetime matching the refresh token. In development the cookie uses `SameSite=Lax`; in production it uses `SameSite=None; Secure` for cross-site frontend deployments. `FRONTEND_ORIGIN` sets the single allowed browser origin for credentialed CORS, and defaults to `http://localhost:5173`. Browser requests must include credentials (`credentials: 'include'` or `withCredentials: true`) for the browser to save and send the cookie. The token remains in the JSON response too for existing clients and Postman.

### Refresh access token

`POST /auth/refresh`

```json
{ "refreshToken": "<refresh JWT>" }
```

HTTP 200 returns a new access token and a rotated refresh token:

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<new refresh JWT>"
}
```

The token signature and JWT expiry must be valid, and its hash must match an unexpired row in `refresh_tokens`; otherwise the service returns 401. A successful refresh replaces the stored hash and expiry, so the submitted refresh token cannot be reused.

## Creating accounts

- **Admins**: `POST /admins` on Group-12-Backend with a super admin's `accessToken` as `Authorization: Bearer <token>`. The backend hashes the password with bcrypt, stores the email lowercase and rejects emails outside `ADMIN_EMAIL_DOMAINS`. The new admin can log in here right away. See the backend README for the request body and error codes.
- **Clients**: `POST /auth/register` on this service. The password is hashed with bcrypt before the client is saved. Reserved admin domains are rejected.

## Tests

```bash
npm test
```

The spec starts a real Nest HTTP server with in-memory tables, so it needs no database. It covers login for all three roles and for clients, the role claim, domain routing, case-insensitive admin emails, both bcrypt prefixes, wrong passwords, unknown emails, body validation and client registration. Admin registration routes remain unavailable on this service.

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

**Use the collection.** Import [Group-12-Auth.postman_collection.json](postman/Group-12-Auth.postman_collection.json), open its Variables tab, and fill in `superAdminEmail`, `superAdminPassword`, `newAdminEmail` (admin domain), `newAdminPassword`, `newAdminRole`, `clientEmail` and `clientPassword`. Run the requests top to bottom. Request 1 saves the super admin token, request 2 registers an admin through the backend with it, and request 3 logs that admin in here. Request 7 registers a client here and request 8 logs it in, so `clientEmail` must be new and outside the admin domains, and the SSN in request 7's body must not be registered yet.

| Step | Request | Body |
| --- | --- | --- |
| Super admin login | `POST {{baseUrl}}/auth/login` | `{ "email": "super@admin.com", "password": "YourPassword123!" }` |
| Register an admin (backend) | `POST {{backendUrl}}/admins` + Bearer token | `{ "firstName": "Alex", "lastName": "Admin", "email": "alex@admin.com", "password": "StrongPassword123!", "role": "operations" }` |
| New admin login | `POST {{baseUrl}}/auth/login` | `{ "email": "alex@admin.com", "password": "StrongPassword123!" }` |
| Register a client | `POST {{baseUrl}}/auth/register` | Use the client registration body above |
| Client login | `POST {{baseUrl}}/auth/login` | `{ "email": "jane@example.com", "password": "ClientPassword123!" }` |
| Health | `GET {{baseUrl}}/users/health` | none |

Expect 200 for logins and 201 for registrations. Client registration returns 400 for reserved admin domains or an invalid body, and 409 for a duplicate email or SSN. Admin registration on the backend returns 401 for a missing token, 403 when an operations or finance token is used, and 409 for an admin email that already exists. Login returns 401 for a wrong password.
