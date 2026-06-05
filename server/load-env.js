// Carrega o .env a partir da RAIZ do projeto (ao lado do server.js), e nao do
// diretorio de onde o `node` foi chamado (process.cwd()). Isso evita o erro
// "SUPABASE_URL nao configurado" quando o backend e iniciado de outra pasta
// (duplo-clique, atalho, ou cd diferente no Windows).
//
// Precisa ser o PRIMEIRO import do server.js: em ESM os imports sao avaliados
// em ordem, entao isso roda antes de qualquer modulo que leia process.env.
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // .../server -> raiz
config({ path: join(root, '.env') });
