// Loaded with --import by `npm run test:server`. Lets plain Node run the server code as it is written for Next.js:
// "@/..." paths, imports without ".ts", and the Supabase clients swapped for the in-memory fake in fakes/.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
