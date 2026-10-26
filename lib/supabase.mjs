// lib/supabase.mjs
// Cliente de Supabase compartido por todos los scrapers.
// Lee las credenciales del archivo .env de forma segura.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL || 'https://mlucplogalnuwrmdxutl.supabase.co';
const key = process.env.SUPABASE_KEY;

if (!key || key === 'PEGA_AQUI_TU_ANON_KEY') {
  console.error('❌  SUPABASE_KEY no configurada.');
  console.error('    Copia .env.example → .env y pon tu anon key de Supabase.');
  process.exit(1);
}

export const supabase = createClient(url, key);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
