import app from './app';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = process.env['PORT'] || 3000;

app.listen(PORT, () => {
  console.warn(`Backend server running on port ${PORT}`);
  console.warn(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
});
