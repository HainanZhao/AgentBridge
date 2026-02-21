import dotenv from 'dotenv';
import { ClawlessApp } from './app/ClawlessApp.js';

// Load environment variables
dotenv.config();

const app = new ClawlessApp();

app.launch().catch((error: any) => {
  console.error('Bot launch failed unexpectedly:', error);
  process.exit(1);
});
