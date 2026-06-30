-- ════════════════════════════════════════════════════════════════════════════
-- 0029 — RETO "¿Cuánto?" : adivinar una CIFRA (no un lugar). Datos + anti-spoiler
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #321. Añadimos un nuevo TIPO de reto en paralelo al de lugar ("¿Dónde es?").
-- En "¿Cuánto?" el creador pregunta una cifra (cuánto costó, cuántos km, cuánto
-- pesa…) y los demás adivinan un número; gana quien más se acerca. El motor de
-- puntuación es el MISMO patrón que la distancia (5000·e^(−x/k)), pero el "error"
-- es el error RELATIVO de la cifra, no kilómetros.
--
-- Esta migración es SOLO F1+F2: datos + anti-spoiler + scoring de servidor/cliente.
-- La UI de crear/jugar es otra fase (no se toca aquí).
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKWARD-COMPATIBLE y DATA-PRESERVING (cero regresión para los retos de lugar):
--   · `challenge_kind` nace con DEFAULT 'location' → TODOS los retos existentes
--     (y los nuevos que no elijan) son de lugar, EXACTAMENTE como hoy.
--   · `challenge_answers.lat/lng` se hacen NULLABLE para poder guardar una respuesta
--     de número (sin lat/lng), pero los retos de lugar siguen teniendo lat/lng NOT
--     NULL de facto (el constraint XOR lo exige). El backfill de 0010 no se toca.
--   · La policy anti-spoiler `challenge_answers_select` (0010) NO cambia: protege la
--     FILA entera, así que `answer_number` queda igual de oculto que lat/lng — no es
--     legible hasta que el reto cierra o el solicitante ya votó.
--   · `submit_vote` (retos de lugar) NO se toca: la nueva RPC `submit_number_vote`
--     es una HERMANA independiente. Cero riesgo de regresión en el voto de lugar.
--
-- ANTI-SPOILER (sagrado): la cifra correcta NUNCA llega al cliente antes de votar.
--   · La respuesta vive en `challenge_answers.answer_number` (misma RLS de 0010).
--   · La ENTRADA de la respuesta del creador va por `challenges.answer_number_src`,
--     con `revoke select` (MISMO patrón que 0010 hizo con `challenges.lat/lng`): el
--     trigger la copia a `challenge_answers`, y nadie la relee salvo la RPC DEFINER.
--
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. challenges.challenge_kind — el TIPO de reto (lugar | número), default lugar
-- ════════════════════════════════════════════════════════════════════════════
-- Default 'location' => al ejecutar el ALTER, todas las filas existentes (retos de
-- lugar) quedan en 'location'. Comportamiento idéntico al de antes. No es spoiler:
-- saber el TIPO de reto no revela la respuesta (igual que score_scale en 0028).
alter table public.challenges
  add column if not exists challenge_kind text not null default 'location'
    check (challenge_kind in ('location', 'number'));

comment on column public.challenges.challenge_kind is
  'Tipo de reto: location (¿Dónde es?, default = comportamiento histórico) o '
  'number (¿Cuánto?, adivinar una cifra). No es spoiler: se sirve al jugar para '
  'que el cliente sepa qué mecánica montar.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Metadatos VISIBLES del reto de número (NO spoiler → se sirven al jugar)
-- ════════════════════════════════════════════════════════════════════════════
-- Estos describen la PREGUNTA y cómo se puntúa, no la RESPUESTA. Se enseñan al
-- jugador (la pregunta, la unidad, los decimales y lo estricto que será el conteo),
-- así que viven en `challenges` (RLS por fila de 0004), no en `challenge_answers`.
-- Todas nullable o con default → los inserts actuales de retos de lugar (que no las
-- mandan) siguen funcionando.
alter table public.challenges
  add column if not exists number_question text;        -- la pregunta: "¿cuánto costó?"
alter table public.challenges
  add column if not exists number_unit text;            -- €/km/kg/%/min… (libre, ≤8)
alter table public.challenges
  add column if not exists number_decimals smallint not null default 0
    check (number_decimals between 0 and 4);            -- decimales a mostrar/entrar
alter table public.challenges
  add column if not exists number_tolerance text not null default 'normal'
    check (number_tolerance in ('indulgente', 'normal', 'estricto'));

-- Unidad libre pero corta (≤8 car): "€", "km/h", "min"… Evita texto arbitrario.
alter table public.challenges
  drop constraint if exists challenges_number_unit_len;
alter table public.challenges
  add constraint challenges_number_unit_len
    check (number_unit is null or char_length(number_unit) <= 8);

comment on column public.challenges.number_question is
  'Reto de número: la pregunta visible al jugar ("¿cuánto creéis que costó?"). No spoiler.';
comment on column public.challenges.number_unit is
  'Reto de número: unidad visible (€, km, kg, %, min…), libre y ≤8 caracteres. No spoiler.';
comment on column public.challenges.number_decimals is
  'Reto de número: decimales con los que se muestra/introduce la cifra (0–4). No spoiler.';
comment on column public.challenges.number_tolerance is
  'Reto de número: cómo de estricto al puntuar (indulgente|normal|estricto). Define la k '
  'de la curva 5000·e^(−error_relativo/k): indulgente=0.50, normal=0.25, estricto=0.10. '
  'No spoiler (no revela la cifra). Análogo a score_scale en el reto de lugar (0028).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. challenge_answers.answer_number — la RESPUESTA OCULTA del reto de número
-- ════════════════════════════════════════════════════════════════════════════
-- Vive en la MISMA tabla anti-spoiler que lat/lng (0010), gobernada por la MISMA
-- policy `challenge_answers_select`: legible solo si el reto está cerrado o el
-- solicitante ya votó. NO tocamos la policy → answer_number queda igual de oculto.
--
-- Como una fila de respuesta es ahora O bien de lugar (lat/lng) O bien de número
-- (answer_number), hacemos lat/lng NULLABLE y añadimos un constraint XOR de payload
-- por tipo. Los retos de lugar existentes ya tienen lat/lng no nulos: el XOR los
-- valida sin tocarlos.
alter table public.challenge_answers
  add column if not exists answer_number numeric;

alter table public.challenge_answers
  alter column lat drop not null;
alter table public.challenge_answers
  alter column lng drop not null;

-- Payload por tipo (XOR): O lugar (lat+lng no null, answer_number null) O número
-- (answer_number no null, lat+lng null). Nunca ambos, nunca ninguno. Las filas de
-- lugar existentes (lat+lng no null, answer_number null) cumplen la primera rama.
alter table public.challenge_answers
  drop constraint if exists challenge_answers_payload_por_tipo;
alter table public.challenge_answers
  add constraint challenge_answers_payload_por_tipo check (
    (lat is not null and lng is not null and answer_number is null)
    or (answer_number is not null and lat is null and lng is null)
  );

comment on column public.challenge_answers.answer_number is
  'Reto de número: la cifra correcta OCULTA (anti-spoiler). Misma RLS que lat/lng '
  '(0010): no legible hasta que el reto cierra o el solicitante ya votó.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. challenges.answer_number_src — ENTRADA de la respuesta del creador, SIN leak
-- ════════════════════════════════════════════════════════════════════════════
-- Igual que lat/lng en el reto de lugar, el creador necesita una columna en
-- `challenges` donde escribir la cifra correcta (el cliente no puede insertar
-- directamente en `challenge_answers`: lo bloquea su RLS para no-dueños). El trigger
-- la copia a `challenge_answers`. Para que NADIE pueda releerla por REST (RLS es por
-- FILA, no por columna), REVOCAMOS su privilegio de columna — MISMO patrón que 0010
-- hizo con `challenges.lat/lng`. Solo la RPC SECURITY DEFINER (que se salta RLS) y el
-- trigger DEFINER la leen server-side.
alter table public.challenges
  add column if not exists answer_number_src numeric;

revoke select (answer_number_src) on public.challenges from authenticated;
revoke select (answer_number_src) on public.challenges from anon;

comment on column public.challenges.answer_number_src is
  'Reto de número: ENTRADA de la cifra correcta del creador. SPOILER: privilegio de '
  'columna REVOCADO (no legible por REST, igual que lat/lng en 0010). El trigger '
  'sync_challenge_answer la copia a challenge_answers.answer_number; nadie la relee '
  'salvo la RPC SECURITY DEFINER.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Trigger sync_challenge_answer — generalizado a lugar | número
-- ════════════════════════════════════════════════════════════════════════════
-- Recrea la función (0022) sin perder NADA de su comportamiento de lugar:
--   · challenge_kind='location' (o null/default) y lat/lng presentes → espeja
--     lat/lng a challenge_answers, answer_number=null. EXACTAMENTE como hoy.
--   · challenge_kind='number' y answer_number_src no null → espeja answer_number a
--     challenge_answers, lat/lng=null.
-- En ambos el upsert es idempotente por challenge_id y deja la fila coherente con el
-- constraint XOR (limpia las columnas del otro tipo). SECURITY DEFINER + search_path
-- como 0012/0022: el INSERT/UPDATE del reto ya pasó por su propia RLS.
create or replace function public.sync_challenge_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.challenge_kind, 'location') = 'number' then
    -- Reto de número: espeja la cifra. Solo cuando ya hay respuesta de origen.
    if new.answer_number_src is not null then
      insert into public.challenge_answers (challenge_id, lat, lng, answer_number)
      values (new.id, null, null, new.answer_number_src)
      on conflict (challenge_id) do update
        set lat           = null,
            lng           = null,
            answer_number = excluded.answer_number;
    end if;
  else
    -- Reto de LUGAR: comportamiento histórico (0022). Solo retos con respuesta.
    if coalesce(new.is_challenge, true) and new.lat is not null and new.lng is not null then
      insert into public.challenge_answers (challenge_id, lat, lng, answer_number)
      values (new.id, new.lat, new.lng, null)
      on conflict (challenge_id) do update
        set lat           = excluded.lat,
            lng           = excluded.lng,
            answer_number = null;
    end if;
  end if;
  return new;
end;
$$;

-- El trigger reacciona al INSERT y a cambios de lat/lng/is_challenge (como 0022) y
-- AHORA también a answer_number_src (la respuesta del reto de número se setea/edita
-- por esa columna). Recrearlo es idempotente.
drop trigger if exists trg_sync_challenge_answer on public.challenges;

create trigger trg_sync_challenge_answer
  after insert or update of lat, lng, is_challenge, answer_number_src on public.challenges
  for each row
  execute function public.sync_challenge_answer();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. votes — adivinanza y error del reto de número (compartiendo `points`)
-- ════════════════════════════════════════════════════════════════════════════
-- Un voto de número guarda `guess_number` (la cifra que dijo) y `abs_error` (|guess −
-- respuesta|, para el revelado y la analítica). `distance_km` queda NULL en votos de
-- número (no hay km), y `points` es COMPARTIDO (0–5000) con el reto de lugar: el
-- marcador y el ranking suman puntos de ambos tipos sin cambios. Ambas nullable →
-- los votos de lugar existentes no se tocan.
alter table public.votes
  add column if not exists guess_number numeric;
alter table public.votes
  add column if not exists abs_error numeric;

comment on column public.votes.guess_number is
  'Reto de número: la cifra que adivinó el jugador (null en votos de lugar o timeout).';
comment on column public.votes.abs_error is
  'Reto de número: error absoluto |guess − respuesta| (null en votos de lugar o timeout).';

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RPC submit_number_vote — autoridad de servidor para el reto de número
-- ════════════════════════════════════════════════════════════════════════════
-- HERMANA de submit_vote (no la generaliza): firma y returns propios del número.
-- Reglas anti-trampa IDÉNTICAS a submit_vote (auth, kind='number' o falla, miembro,
-- grupo no cerrado, plazo abierto, timeout → 0 pts, upsert idempotente por
-- (challenge_id,user_id)). Scoring por ERROR RELATIVO (invariante de escala):
--   abs_error  = |guess − answer|
--   rel_error  = abs_error / greatest(abs(answer), 1)   -- ε=1 evita /0 si answer=0
--   points     = greatest(0, round(5000 * exp(−rel_error / k)))
-- con k por tolerancia: indulgente=0.50, normal=0.25, estricto=0.10 (coalesce normal).
-- Revela answer_number SOLO si votó (p_guess no null). REPLICA EXACTA en geo.ts
-- (scoreForNumber): no cambiar una sin la otra.
--
-- SECURITY DEFINER: lee answer_number (privilegio revocado para el cliente) y escribe
-- votes (INSERT/UPDATE directo cerrado en 0010) server-side. La validación de
-- membresía/estado la hace la función, no la RLS. search_path fijado (anti-secuestro).
create or replace function public.submit_number_vote(
  p_challenge_id uuid,
  p_guess numeric,
  p_left_app boolean default false,
  p_elapsed_seconds integer default null
)
returns table (
  abs_error numeric,
  rel_error numeric,
  points integer,
  answer_number numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_group  text;
  v_open   boolean;
  v_closed timestamptz;
  v_kind   text;
  v_tol    text;
  v_ans    numeric;
  v_abs    numeric;
  v_rel    numeric;
  v_pts    integer;
  v_k      double precision;
  -- Constante que REPLICA geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_base constant double precision := 5000;             -- puntos máximos
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Reto + estado abierto + respuesta (cifra) + estado del grupo (closed_at) + tipo
  -- + tolerancia, de una vez. Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.answer_number, g.closed_at,
         c.challenge_kind, c.number_tolerance
    into v_group, v_open, v_ans, v_closed, v_kind, v_tol
  from public.challenges c
  join public.challenge_answers a on a.challenge_id = c.id
  join public.groups g on g.id = c.group_id
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Reto no encontrado' using errcode = 'P0002';
  end if;

  -- Debe ser un reto de NÚMERO: usar esta RPC sobre un reto de lugar falla (para
  -- el lugar está submit_vote). Cualquier otro tipo (o null) no se vota por aquí.
  if coalesce(v_kind, 'location') <> 'number' then
    raise exception 'Este reto no es de número' using errcode = 'P0001';
  end if;

  -- Membresía: solo un miembro del grupo del reto puede votar.
  if not public.is_group_member(v_group) then
    raise exception 'No eres miembro del grupo de este reto' using errcode = '42501';
  end if;

  -- Grupo cerrado (fin de temporada): solo-lectura, no se admiten votos nuevos.
  if v_closed is not null then
    raise exception 'El grupo está cerrado' using errcode = 'P0001';
  end if;

  -- El reto debe seguir abierto para votar (con cifra o por timeout).
  if not v_open then
    raise exception 'El reto ya está cerrado' using errcode = 'P0001';
  end if;

  -- k según la tolerancia. coalesce a 'normal' (defensivo). REPLICA geo.ts.
  v_k := case coalesce(v_tol, 'normal')
           when 'indulgente' then 0.50
           when 'normal'     then 0.25
           when 'estricto'   then 0.10
           else 0.25
         end;

  if p_guess is null then
    -- Voto de TIMEOUT: jugó pero no respondió → 0 puntos, sin cifra (como 0007).
    v_abs := null;
    v_rel := null;
    v_pts := 0;
  else
    -- Error RELATIVO: normaliza por la magnitud de la respuesta → invariante de
    -- escala (50€ y 50.000€ con mismo % de error puntúan igual). ε=1 evita /0.
    v_abs := abs(p_guess - v_ans);
    v_rel := v_abs / greatest(abs(v_ans), 1);
    -- Puntos (idéntico a geo.scoreForNumber): max(0, round(5000*exp(−rel/k))).
    v_pts := greatest(0, round(c_base * exp(-v_rel / v_k)))::integer;
  end if;

  -- UPSERT idempotente por (challenge_id, user_id): revotar no duplica ni cambia un
  -- voto ya emitido a otra cosa. El group_id se toma del reto (no del cliente).
  -- distance_km/guess_lat/guess_lng quedan null (es un voto de número).
  insert into public.votes (
    group_id, challenge_id, user_id, guess_number, abs_error,
    distance_km, points, left_app, elapsed_seconds
  )
  values (
    v_group, p_challenge_id, v_uid, p_guess, v_abs,
    null, v_pts, coalesce(p_left_app, false), p_elapsed_seconds
  )
  on conflict (challenge_id, user_id) do update
    set guess_number    = excluded.guess_number,
        abs_error       = excluded.abs_error,
        distance_km     = excluded.distance_km,
        points          = excluded.points,
        left_app        = excluded.left_app,
        elapsed_seconds = excluded.elapsed_seconds;

  -- Revelado: error abs/rel + puntos + la cifra (null en timeout: no se revela).
  return query select
    v_abs,
    v_rel,
    v_pts,
    case when p_guess is null then null else v_ans end;
end;
$$;

-- Solo los usuarios autenticados pueden ejecutar la RPC (no el rol anónimo).
revoke all on function public.submit_number_vote(uuid, numeric, boolean, integer) from public;
grant execute on function public.submit_number_vote(uuid, numeric, boolean, integer) to authenticated;
