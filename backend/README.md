# peakspend - Backend

Node.js 22 LTS REST API with Express, TypeScript, and Prisma.

## Tech Stack

- Node.js 22 LTS with Express 4.x
- TypeScript 5.x
- Prisma 6.x ORM
- PostgreSQL 17.6
- Redis 7
- Passport.js + JWT authentication
- AWS SDK (S3, Textract)

## Prerequisites

- Node.js 22 LTS
- PostgreSQL 17.6
- Redis 7

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your database and service credentials.

### 3. Setup Database

```bash
npx prisma migrate dev
```

### 4. Run Development Server

```bash
npm run dev
```

Backend API will be available at [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── controllers/    # Route handlers
├── services/       # Business logic
├── models/         # Database models (Prisma)
├── middleware/     # Express middleware
├── routes/         # API routes
├── config/         # Configuration
├── types/          # TypeScript types
├── utils/          # Utility functions
├── app.ts          # Express app setup
└── server.ts       # Server entry point
```

## Available Scripts

- `npm run dev` - Development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm test` - Run tests

## API Endpoints

- `GET /health` - Health check endpoint

## Docker

Use Docker Compose from project root:

```bash
docker-compose up backend
```

## Code Quality Tools

### Linting

Run ESLint to check for code quality issues:

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run lint:fix
```

### Formatting

Check code formatting with Prettier:

```bash
npm run format:check
```

Format code with Prettier:

```bash
npm run format
```

### Type Checking

Run TypeScript type checking:

```bash
npx tsc --noEmit
```
