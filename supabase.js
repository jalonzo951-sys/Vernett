// ═══════════════════════════════════════════
// TAPCARD — Supabase Configuration
// ═══════════════════════════════════════════
// STEP 1: Create a free project at supabase.com
// STEP 2: Go to Settings → API
// STEP 3: Copy your Project URL and anon/public key below

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ═══════════════════════════════════════════
// SQL to run in Supabase SQL Editor:
// ═══════════════════════════════════════════
/*

-- 1. PROFILES TABLE (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  email text,
  role text default 'individual' check (role in ('superadmin','company_admin','employee','individual')),
  company_id uuid,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Superadmin full access" on public.profiles for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
);

-- 2. COMPANIES TABLE
create table public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  logo_url text,
  industry text,
  admin_id uuid references public.profiles(id),
  plan text default 'business' check (plan in ('basic','business','enterprise')),
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.companies enable row level security;
create policy "Company admin can manage their company" on public.companies for all using (
  admin_id = auth.uid() or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
);

-- 3. CARDS TABLE (physical NFC cards)
create table public.cards (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  user_id uuid references public.profiles(id),
  company_id uuid references public.companies(id),
  tag_uid text,
  activated boolean default false,
  created_at timestamptz default now()
);
alter table public.cards enable row level security;
create policy "Card owner can view card" on public.cards for select using (
  user_id = auth.uid() or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin') or
  exists (select 1 from public.companies c join public.profiles p on c.admin_id = p.id where c.id = cards.company_id and p.id = auth.uid())
);
create policy "Superadmin can manage cards" on public.cards for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
);

-- 4. PUBLIC PROFILES (what people see when they scan a card)
create table public.card_profiles (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references public.cards(id) unique,
  user_id uuid references public.profiles(id),
  name text,
  title text,
  company_name text,
  department text,
  bio text,
  email text,
  phone text,
  linkedin text,
  instagram text,
  whatsapp text,
  twitter text,
  website text,
  photo_url text,
  theme integer default 0,
  views integer default 0,
  updated_at timestamptz default now()
);
alter table public.card_profiles enable row level security;
create policy "Public profiles are viewable by all" on public.card_profiles for select using (true);
create policy "Profile owner can update" on public.card_profiles for update using (user_id = auth.uid());
create policy "Profile owner can insert" on public.card_profiles for insert with check (user_id = auth.uid());

-- 5. SCAN ANALYTICS
create table public.scans (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references public.cards(id),
  scanned_at timestamptz default now(),
  country text,
  city text
);
alter table public.scans enable row level security;
create policy "Anyone can insert scan" on public.scans for insert with check (true);
create policy "Card owner can view scans" on public.scans for select using (
  exists (select 1 from public.cards where id = scans.card_id and user_id = auth.uid()) or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
);

-- 6. AUTO-CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, coalesce(new.raw_user_meta_data->>'role','individual'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. SUPERADMIN — set your user as superadmin after first login:
-- update public.profiles set role = 'superadmin' where email = 'jalonzo951@gmail.com';

*/

// ═══════════════════════════════════════════
// Supabase Client (loaded via CDN in HTML)
// ═══════════════════════════════════════════
let _sb = null;

function getSB() {
  if (!_sb) {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      console.warn('⚠️ Supabase not configured. Using localStorage fallback.');
      return null;
    }
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}

// ── Auth helpers ──────────────────────────
async function sbSignUp(email, password, meta = {}) {
  const sb = getSB();
  if (!sb) return localSignUp(email, password, meta);
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta } });
  if (error) throw error;
  return data;
}

async function sbSignIn(email, password) {
  const sb = getSB();
  if (!sb) return localSignIn(email, password);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  const sb = getSB();
  if (!sb) { localStorage.removeItem('tc_session'); return; }
  await sb.auth.signOut();
}

async function sbGetUser() {
  const sb = getSB();
  if (!sb) return localGetUser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  return { ...user, profile };
}

// ── Data helpers ──────────────────────────
async function sbGetProfile(cardId) {
  const sb = getSB();
  if (!sb) return localGetProfile(cardId);
  const { data, error } = await sb.from('card_profiles').select('*').eq('card_id', cardId).single();
  if (error) return null;
  return data;
}

async function sbSaveProfile(cardId, profileData) {
  const sb = getSB();
  if (!sb) return localSaveProfile(cardId, profileData);
  const user = await sbGetUser();
  const payload = { ...profileData, card_id: cardId, user_id: user.id, updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('card_profiles').upsert(payload, { onConflict: 'card_id' });
  if (error) throw error;
  return data;
}

async function sbGetCompanies() {
  const sb = getSB();
  if (!sb) return localGetCompanies();
  const { data } = await sb.from('companies').select('*, profiles(full_name, email)').order('created_at', { ascending: false });
  return data || [];
}

async function sbCreateCompany(company) {
  const sb = getSB();
  if (!sb) return localCreateCompany(company);
  const { data, error } = await sb.from('companies').insert(company).select().single();
  if (error) throw error;
  return data;
}

async function sbGetCards(filters = {}) {
  const sb = getSB();
  if (!sb) return localGetCards(filters);
  let q = sb.from('cards').select('*, card_profiles(*), profiles(full_name, email)');
  if (filters.company_id) q = q.eq('company_id', filters.company_id);
  if (filters.user_id)    q = q.eq('user_id', filters.user_id);
  const { data } = await q.order('created_at', { ascending: false });
  return data || [];
}

async function sbGenerateCards(count, companyId = null) {
  const sb = getSB();
  const cards = Array.from({ length: count }, () => ({
    code: 'TC-' + Math.random().toString(36).slice(2,6).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase(),
    company_id: companyId,
    activated: false
  }));
  if (!sb) return localGenerateCards(cards);
  const { data, error } = await sb.from('cards').insert(cards).select();
  if (error) throw error;
  return data;
}

async function sbRecordScan(cardId) {
  const sb = getSB();
  if (!sb) return;
  await sb.from('scans').insert({ card_id: cardId });
  await sb.from('card_profiles').update({ views: sb.raw('views + 1') }).eq('card_id', cardId);
}

async function sbGetAllUsers() {
  const sb = getSB();
  if (!sb) return localGetAllUsers();
  const { data } = await sb.from('profiles').select('*, companies(name)').order('created_at', { ascending: false });
  return data || [];
}

async function sbGetStats() {
  const sb = getSB();
  if (!sb) return localGetStats();
  const [users, companies, cards, scans] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact' }),
    sb.from('companies').select('id', { count: 'exact' }),
    sb.from('cards').select('id', { count: 'exact' }),
    sb.from('scans').select('id', { count: 'exact' }),
  ]);
  return {
    users: users.count || 0,
    companies: companies.count || 0,
    cards: cards.count || 0,
    scans: scans.count || 0,
  };
}

// ═══════════════════════════════════════════
// LOCAL STORAGE FALLBACK (when Supabase not configured)
// ═══════════════════════════════════════════
function localSignUp(email, password, meta) {
  const users = JSON.parse(localStorage.getItem('tc_users') || '[]');
  if (users.find(u => u.email === email)) throw new Error('Email ya registrado');
  const user = { id: 'u_' + Date.now(), email, password: btoa(password), ...meta, created_at: new Date().toISOString() };
  users.push(user);
  localStorage.setItem('tc_users', JSON.stringify(users));
  localStorage.setItem('tc_session', JSON.stringify(user));
  return { user };
}
function localSignIn(email, password) {
  const users = JSON.parse(localStorage.getItem('tc_users') || '[]');
  const user = users.find(u => u.email === email && u.password === btoa(password));
  if (!user) throw new Error('Email o contraseña incorrectos');
  localStorage.setItem('tc_session', JSON.stringify(user));
  return { user };
}
function localGetUser() {
  const s = localStorage.getItem('tc_session');
  return s ? JSON.parse(s) : null;
}
function localGetProfile(cardId) {
  const profiles = JSON.parse(localStorage.getItem('tc_profiles') || '{}');
  return profiles[cardId] || null;
}
function localSaveProfile(cardId, data) {
  const profiles = JSON.parse(localStorage.getItem('tc_profiles') || '{}');
  profiles[cardId] = { ...data, card_id: cardId, updated_at: new Date().toISOString() };
  localStorage.setItem('tc_profiles', JSON.stringify(profiles));
  return profiles[cardId];
}
function localGetCompanies() {
  return JSON.parse(localStorage.getItem('tc_companies') || '[]');
}
function localCreateCompany(c) {
  const companies = localGetCompanies();
  const company = { ...c, id: 'co_' + Date.now(), created_at: new Date().toISOString() };
  companies.push(company);
  localStorage.setItem('tc_companies', JSON.stringify(companies));
  return company;
}
function localGetCards(filters) {
  const cards = JSON.parse(localStorage.getItem('tc_cards') || '[]');
  const profiles = JSON.parse(localStorage.getItem('tc_profiles') || '{}');
  return cards
    .filter(c => !filters.company_id || c.company_id === filters.company_id)
    .filter(c => !filters.user_id || c.user_id === filters.user_id)
    .map(c => ({ ...c, card_profiles: profiles[c.id] || null }));
}
function localGenerateCards(cards) {
  const existing = JSON.parse(localStorage.getItem('tc_cards') || '[]');
  const newCards = cards.map(c => ({ ...c, id: 'c_' + Math.random().toString(36).slice(2,10), created_at: new Date().toISOString() }));
  localStorage.setItem('tc_cards', JSON.stringify([...existing, ...newCards]));
  return newCards;
}
function localGetAllUsers() {
  return JSON.parse(localStorage.getItem('tc_users') || '[]');
}
function localGetStats() {
  return {
    users: JSON.parse(localStorage.getItem('tc_users') || '[]').length,
    companies: localGetCompanies().length,
    cards: JSON.parse(localStorage.getItem('tc_cards') || '[]').length,
    scans: 0,
  };
}

// ── Auth Guard ────────────────────────────
async function requireAuth(allowedRoles = []) {
  const user = await sbGetUser();
  if (!user) { window.location.href = 'login.html'; throw new Error('Not authenticated'); }
  if (allowedRoles.length && !allowedRoles.includes(user.profile?.role || user.role)) {
    window.location.href = 'dashboard.html';
    throw new Error('Unauthorized');
  }
  return user;
}
