// Prueba de carga de Boxinger con k6 (https://k6.io): personas que entran, abren «Mis Buzones»,
// entran al buzón y cargan ideas, igual que en el navegador. Van llegando de a poco hasta ser USUARIOS a la vez.
//
//   python3 scripts/stress/preparar.py crear          (una vez: buzón y personas de prueba)
//   k6 run scripts/stress/prueba.js                     (100 personas, ~13 minutos)
//   k6 run -e USUARIOS=5 -e SUBIDA=1m -e MESETA=1m scripts/stress/prueba.js   (prueba chica)
//   python3 scripts/stress/preparar.py borrar          (al final: borra todo lo de la prueba)
//
// Variables: SITIO (https://www.boxinger.com), USUARIOS (100), SUBIDA (8m: cuánto tardan en llegar todos),
// MESETA (4m: cuánto se quedan todos juntos).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';

const D = JSON.parse(open('./usuarios.json'));
const SITE = (__ENV.SITIO || 'https://www.boxinger.com').replace(/\/$/, '');
const USERS = Math.min(Number(__ENV.USUARIOS || 100), D.emails.length);
const REF = D.supabase_url.match(/https:\/\/([^.]+)\./)[1];

export const options = {
  // k6 borra las cookies en cada vuelta; una persona real sigue con la sesión iniciada.
  noCookiesReset: true,
  scenarios: {
    personas: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.SUBIDA || '8m', target: USERS },
        { duration: __ENV.MESETA || '4m', target: USERS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  // Lo que consideramos «anda bien»: el 95 % de cada paso tarda menos que esto.
  thresholds: {
    'paso_login': ['p(95)<1500'],
    'paso_mis_buzones': ['p(95)<2500'],
    'paso_abrir_buzon': ['p(95)<2500'],
    'paso_cargar_idea': ['p(95)<1500'],
    'paso_recargar_buzon': ['p(95)<1500'],
    'checks': ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
};

const tLogin = new Trend('paso_login', true);
const tBuzones = new Trend('paso_mis_buzones', true);
const tBuzon = new Trend('paso_abrir_buzon', true);
const tIdea = new Trend('paso_cargar_idea', true);
const tRecarga = new Trend('paso_recargar_buzon', true);
const ideas = new Counter('ideas_cargadas');
const login429 = new Counter('login_frenado_por_limite');

const between = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const sbHeaders = (token) => ({ apikey: D.anon_key, Authorization: 'Bearer ' + (token || D.anon_key), 'Content-Type': 'application/json' });

// Lo que guarda @supabase/ssr en el navegador: «base64-» + la sesión en base64url, en pedazos de 3180 caracteres.
function setSessionCookie(session) {
  const name = `sb-${REF}-auth-token`;
  const value = 'base64-' + encoding.b64encode(JSON.stringify(session), 'rawurl');
  const jar = http.cookieJar();
  if (value.length <= 3180) { jar.set(SITE, name, value, { path: '/' }); return; }
  for (let i = 0; i * 3180 < value.length; i++) jar.set(SITE, `${name}.${i}`, value.slice(i * 3180, (i + 1) * 3180), { path: '/' });
}

let session = null;

function login() {
  http.get(SITE + '/app/ingresar', { tags: { name: 'pagina_ingresar' } });
  sleep(between(3, 6)); // escribir email y contraseña
  const email = D.emails[(__VU - 1) % USERS];
  for (let tries = 0; tries < 12; tries++) {
    const r = http.post(`${D.supabase_url}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email, password: D.password, gotrue_meta_security: {} }), { headers: sbHeaders(), tags: { name: 'login' } });
    if (r.status === 429) { login429.add(1); sleep(between(20, 40)); continue; }
    tLogin.add(r.timings.duration);
    if (!check(r, { 'login ok': (x) => x.status === 200 })) return null;
    const s = r.json();
    setSessionCookie(s);
    return s;
  }
  check(null, { 'login ok': () => false });
  return null;
}

export default function () {
  if (!session) {
    session = login();
    if (!session) { sleep(30); return; }
  }

  // «Mis Buzones» (página que arma el servidor de Vercel)
  let r = http.get(SITE + '/app/buzones', { tags: { name: 'mis_buzones' } });
  tBuzones.add(r.timings.duration);
  if (!check(r, {
    'mis buzones ok': (x) => x.status === 200 && !x.url.includes('/app/ingresar'),
    'mis buzones muestra el buzón': (x) => typeof x.body === 'string' && x.body.includes('Prueba de carga'),
  })) console.warn(`mis buzones falló (${r.status}, ${r.url})`);
  sleep(between(2, 5));

  // Entrar al buzón
  r = http.get(`${SITE}/app/b/${D.slug}`, { tags: { name: 'abrir_buzon' } });
  tBuzon.add(r.timings.duration);
  if (!check(r, { 'buzón ok': (x) => x.status === 200 && typeof x.body === 'string' && x.body.includes('Prueba de carga') }))
    console.warn(`buzón falló (${r.status}, ${r.url})`);
  sleep(between(15, 30)); // escribir la idea

  // Cargar la idea (lo mismo que el botón «Publicar»)
  const n = Math.floor(Math.random() * 1e6);
  r = http.post(`${D.supabase_url}/rest/v1/rpc/create_idea`, JSON.stringify({
    p_board: D.board_id,
    p_title: `Idea de prueba ${n}`,
    p_description: `Esta idea la cargó la prueba de carga (persona ${__VU}, vuelta ${__ITER}). Se borra al terminar.`,
    p_category: pick(D.categories),
  }), { headers: sbHeaders(session.access_token), tags: { name: 'cargar_idea' } });
  tIdea.add(r.timings.duration);
  if (check(r, { 'idea cargada': (x) => x.status === 200 })) ideas.add(1);
  else console.warn(`idea no cargada (${r.status}): ${String(r.body).slice(0, 200)}`);

  // El buzón se vuelve a cargar para mostrar la idea nueva
  r = http.post(`${D.supabase_url}/rest/v1/rpc/get_board`, JSON.stringify({ p_slug: D.slug }),
    { headers: sbHeaders(session.access_token), tags: { name: 'recargar_buzon' } });
  tRecarga.add(r.timings.duration);
  check(r, { 'buzón recargado': (x) => x.status === 200 });

  // Leer, votar, pensar… hasta la próxima idea (Boxinger deja cargar hasta 5 ideas cada 10 minutos por persona)
  sleep(between(130, 170));
}
