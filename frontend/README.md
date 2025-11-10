# peakspend - Frontend

React 19.2 Progressive Web App with TypeScript and Material-UI.

## Tech Stack

- **React** 19.2.0 - UI library
- **TypeScript** 5.x - Type safety
- **Vite** - Build tool and dev server
- **Material-UI** 6.x - Component library
- **React Query** - Server state management
- **React Router** - Client-side routing
- **Axios** - HTTP client

## Prerequisites

- Node.js 22 LTS
- npm or yarn

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration.

### 3. Run Development Server

```bash
npm run dev
```

Frontend will be available at [http://localhost:5173](http://localhost:5173)

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Route-level page components
├── services/       # API client services
├── hooks/          # Custom React hooks
├── context/        # React Context providers
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
├── App.tsx         # Main app component
└── main.tsx        # Entry point
```

## Available Scripts

- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run linter

## Docker

Use Docker Compose from project root:

```bash
docker-compose up frontend
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
