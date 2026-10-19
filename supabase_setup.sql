-- =====================================================================================
-- WHITEPRINTS · configuração da base de dados no Supabase (executar UMA vez)
-- =====================================================================================
-- Como usar: Supabase → SQL Editor → New query → colar TUDO → Run.
-- ANTES de correr: crie os utilizadores (Authentication → Users → Add user, com
-- "Auto Confirm User" ligado) e desligue o registo livre (ver LEIA-ME).
-- Quem existir em Authentication → Users no momento em que este script corre fica
-- autorizado a usar a app. Pode voltar a correr o script sem perder dados.
-- =====================================================================================


-- 1. TABELAS ---------------------------------------------------------------------------
-- Dinheiro em cêntimos (BIGINT). Datas em DATE.

CREATE TABLE IF NOT EXISTS meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- Quem pode entrar na app (emails). Só é lido pela função wp_is_member().
CREATE TABLE IF NOT EXISTS team_members (
    email  TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name    TEXT NOT NULL,
    email   TEXT UNIQUE,
    active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS clients (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    tax_id      TEXT,
    email       TEXT,
    phone       TEXT,
    address     TEXT,
    source      TEXT NOT NULL DEFAULT 'outro'
                CHECK (source IN ('formulario','whatsapp','telefone','recomendacao','redes sociais','presencial','outro')),
    status      TEXT NOT NULL DEFAULT 'lead'
                CHECK (status IN ('lead','ativo','recorrente','inativo')),
    vendus_ref  TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    role        TEXT,
    email       TEXT,
    phone       TEXT,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS suppliers (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name   TEXT NOT NULL,
    email  TEXT,
    phone  TEXT,
    notes  TEXT
);

CREATE TABLE IF NOT EXISTS catalog_items (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'outro'
                     CHECK (category IN ('impressao','textil dtf','redes sociais','foto e video','design','outro')),
    unit             TEXT NOT NULL DEFAULT 'un',
    unit_price_cents BIGINT NOT NULL DEFAULT 0,
    vat_rate         NUMERIC(5,2) NOT NULL DEFAULT 23,
    description      TEXT,
    active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS quotes (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number       TEXT NOT NULL UNIQUE,
    client_id    BIGINT NOT NULL REFERENCES clients(id),
    status       TEXT NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','enviado','aceite','recusado')),
    issued_on    DATE,
    valid_until  DATE,
    notes        TEXT,
    created_by   BIGINT REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_lines (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_id         BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL DEFAULT 0,
    description      TEXT NOT NULL,
    specs            TEXT,
    quantity         NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_price_cents BIGINT NOT NULL DEFAULT 0,
    vat_rate         NUMERIC(5,2) NOT NULL DEFAULT 23,
    catalog_item_id  BIGINT REFERENCES catalog_items(id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference        TEXT NOT NULL UNIQUE,
    client_id        BIGINT NOT NULL REFERENCES clients(id),
    title            TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'outro'
                     CHECK (category IN ('impressao','textil dtf','redes sociais','foto e video','design','outro')),
    status           TEXT NOT NULL DEFAULT 'Em orçamento'
                     CHECK (status IN ('Em orçamento','Adjudicado','Em produção','Completo','Entregue')),
    priority         INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
    due_date         DATE,
    delivered_on     DATE,
    owner_id         BIGINT REFERENCES users(id),
    quote_id         BIGINT REFERENCES quotes(id),
    repeat_of_job_id BIGINT REFERENCES jobs(id),
    invoice_ref      TEXT,
    paid             BOOLEAN NOT NULL DEFAULT FALSE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_items (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id           BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL DEFAULT 0,
    description      TEXT NOT NULL,
    specs            TEXT,
    quantity         NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_price_cents BIGINT NOT NULL DEFAULT 0,
    unit_cost_cents  BIGINT NOT NULL DEFAULT 0,
    vat_rate         NUMERIC(5,2) NOT NULL DEFAULT 23,
    supplier_id      BIGINT REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS retainers (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id           BIGINT NOT NULL REFERENCES clients(id),
    name                TEXT NOT NULL,
    scope               TEXT,
    monthly_price_cents BIGINT NOT NULL DEFAULT 0,
    billing_day         INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
    start_on            DATE,
    end_on              DATE,
    status              TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','terminada')),
    notes               TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title         TEXT NOT NULL,
    description   TEXT,
    due_date      DATE,
    priority      INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
    status        TEXT NOT NULL DEFAULT 'por fazer' CHECK (status IN ('por fazer','em curso','feito')),
    assignee_id   BIGINT REFERENCES users(id),
    job_id        BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
    client_id     BIGINT REFERENCES clients(id) ON DELETE CASCADE,
    retainer_id   BIGINT REFERENCES retainers(id) ON DELETE CASCADE,
    completed_at  DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ficheiros: o ficheiro fica no armazenamento privado do Supabase; aqui guarda-se o caminho dele.
CREATE TABLE IF NOT EXISTS files (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    job_id        BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'outro'
                  CHECK (kind IN ('briefing','arte final','prova','contrato','fatura','foto','video','outro')),
    storage_path  TEXT NOT NULL,
    version       INTEGER NOT NULL DEFAULT 1,
    approved      BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by   BIGINT REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_due   ON jobs(status, due_date);
CREATE INDEX IF NOT EXISTS idx_jobs_client       ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due  ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_files_client      ON files(client_id);
CREATE INDEX IF NOT EXISTS idx_files_job         ON files(job_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client     ON quotes(client_id);

INSERT INTO meta (key, value) VALUES ('schema_version', 'web-1') ON CONFLICT (key) DO NOTHING;


-- 2. DADOS INICIAIS (só se ainda não existirem) ----------------------------------------

INSERT INTO users (name)
SELECT n FROM (VALUES ('André'), ('Marina')) AS v(n)
WHERE NOT EXISTS (SELECT 1 FROM users);

-- Preços a 0 de propósito: ainda estão por definir. Editem no separador «Catálogo».
INSERT INTO catalog_items (name, category, unit, unit_price_cents, description)
SELECT v.name, v.category, v.unit, 0, 'Preço por definir'
FROM (VALUES
    ('Cartões de visita', 'impressao', 'un'),
    ('Folhetos / flyers', 'impressao', 'un'),
    ('Cartazes', 'impressao', 'un'),
    ('Menus', 'impressao', 'un'),
    ('Convites', 'impressao', 'un'),
    ('Autocolantes', 'impressao', 'un'),
    ('Livretes', 'impressao', 'un'),
    ('Personalização têxtil DTF', 'textil dtf', 'un'),
    ('Gestão de redes sociais (avença)', 'redes sociais', 'mês'),
    ('Sessão fotográfica', 'foto e video', 'h'),
    ('Produção de vídeo', 'foto e video', 'h'),
    ('Design / identidade visual', 'design', 'h')
) AS v(name, category, unit)
WHERE NOT EXISTS (SELECT 1 FROM catalog_items);

-- Autoriza quem já existe em Authentication → Users.
INSERT INTO team_members (email)
SELECT lower(u.email) FROM auth.users u WHERE u.email IS NOT NULL
ON CONFLICT DO NOTHING;


-- 3. FUNÇÕES ---------------------------------------------------------------------------
-- A app só fala com a base de dados através destas funções (e do armazenamento de ficheiros).

-- Está autenticado E na lista de pessoas autorizadas?
CREATE OR REPLACE FUNCTION wp_is_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM team_members m
        WHERE lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

-- Numeração sequencial por ano: ORC-2026-001, T-2026-001.
CREATE OR REPLACE FUNCTION wp_next_number(p_table text, p_col text, p_prefix text, p_today date) RETURNS text
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_stem text := p_prefix || '-' || extract(year FROM p_today)::int || '-';
    v_n integer;
BEGIN
    IF (p_table, p_col) NOT IN (('quotes', 'number'), ('jobs', 'reference')) THEN
        RAISE EXCEPTION 'Numeração não suportada';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(p_table || p_col));
    EXECUTE format('SELECT coalesce(max(substr(%I, $1)::integer), 0) FROM %I WHERE %I LIKE $2', p_col, p_table, p_col)
        INTO v_n USING length(v_stem) + 1, v_stem || '%';
    RETURN v_stem || lpad((v_n + 1)::text, 3, '0');
END $$;

-- Insere linhas (orçamento ou trabalho) a partir de uma lista JSON.
CREATE OR REPLACE FUNCTION wp_insert_lines(p_kind text, p_parent bigint, p_lines jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF p_kind = 'quote_lines' THEN
        INSERT INTO quote_lines (quote_id, position, description, specs, quantity, unit_price_cents, vat_rate, catalog_item_id)
        SELECT p_parent, (e.ord - 1)::int, r.description, nullif(r.specs, ''), coalesce(r.quantity, 1),
               coalesce(r.unit_price_cents, 0), coalesce(r.vat_rate, 23), r.catalog_item_id
        FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) WITH ORDINALITY AS e(obj, ord),
             LATERAL jsonb_populate_record(null::quote_lines, e.obj) AS r;
    ELSIF p_kind = 'job_items' THEN
        INSERT INTO job_items (job_id, position, description, specs, quantity, unit_price_cents, unit_cost_cents, vat_rate, supplier_id)
        SELECT p_parent, (e.ord - 1)::int, r.description, nullif(r.specs, ''), coalesce(r.quantity, 1),
               coalesce(r.unit_price_cents, 0), coalesce(r.unit_cost_cents, 0), coalesce(r.vat_rate, 23), r.supplier_id
        FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) WITH ORDINALITY AS e(obj, ord),
             LATERAL jsonb_populate_record(null::job_items, e.obj) AS r;
    ELSE
        RAISE EXCEPTION 'Tipo de linhas inválido';
    END IF;
END $$;

-- ---- leitura --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wp_list_users() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb) FROM users u WHERE u.active;
$$;

CREATE OR REPLACE FUNCTION wp_list_clients(p_search text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY lower(x.name)), '[]'::jsonb)
    FROM (
        SELECT c.*,
               (SELECT count(*) FROM jobs j WHERE j.client_id = c.id AND j.status <> 'Entregue') AS open_jobs,
               (SELECT count(*) FROM jobs j WHERE j.client_id = c.id) AS total_jobs
        FROM clients c
        WHERE coalesce(btrim(p_search), '') = ''
           OR c.name ILIKE '%' || btrim(p_search) || '%' OR c.email ILIKE '%' || btrim(p_search) || '%'
           OR c.phone ILIKE '%' || btrim(p_search) || '%' OR c.tax_id ILIKE '%' || btrim(p_search) || '%'
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_list_jobs(p_client bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.due_date NULLS LAST, x.priority DESC, x.id DESC), '[]'::jsonb)
    FROM (
        SELECT j.*, c.name AS client_name, u.name AS owner_name,
               coalesce((SELECT sum(round(i.quantity * i.unit_price_cents)) FROM job_items i WHERE i.job_id = j.id), 0)::bigint AS net_cents
        FROM jobs j JOIN clients c ON c.id = j.client_id LEFT JOIN users u ON u.id = j.owner_id
        WHERE p_client IS NULL OR j.client_id = p_client
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_list_quotes(p_client bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC), '[]'::jsonb)
    FROM (
        SELECT q.*, c.name AS client_name,
               coalesce((SELECT sum(round(l.quantity * l.unit_price_cents)
                                    + round(round(l.quantity * l.unit_price_cents) * l.vat_rate / 100))
                         FROM quote_lines l WHERE l.quote_id = q.id), 0)::bigint AS gross_cents,
               (SELECT j.id FROM jobs j WHERE j.quote_id = q.id LIMIT 1) AS job_id,
               (SELECT j.reference FROM jobs j WHERE j.quote_id = q.id LIMIT 1) AS job_ref
        FROM quotes q JOIN clients c ON c.id = q.client_id
        WHERE p_client IS NULL OR q.client_id = p_client
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_list_retainers(p_client bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY (x.status = 'terminada'), lower(x.client_name), x.id), '[]'::jsonb)
    FROM (
        SELECT r.*, c.name AS client_name FROM retainers r JOIN clients c ON c.id = r.client_id
        WHERE p_client IS NULL OR r.client_id = p_client
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_list_catalog(p_active_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.category, c.name), '[]'::jsonb)
    FROM catalog_items c WHERE NOT p_active_only OR c.active;
$$;

CREATE OR REPLACE FUNCTION wp_list_files(p_client bigint DEFAULT NULL, p_job bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
    FROM (
        SELECT f.*, j.reference AS job_ref, u.name AS uploaded_by_name
        FROM files f LEFT JOIN jobs j ON j.id = f.job_id LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE (p_client IS NULL OR f.client_id = p_client) AND (p_job IS NULL OR f.job_id = p_job)
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_list_tasks(p_assignee bigint DEFAULT NULL, p_show_done boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY (x.status = 'feito'), x.due_date NULLS LAST, x.priority DESC, x.id), '[]'::jsonb)
    FROM (
        SELECT t.*, u.name AS assignee_name, j.reference AS job_ref, j.title AS job_title,
               coalesce(c.name, jc.name) AS client_name
        FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN jobs j ON j.id = t.job_id
             LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN clients jc ON jc.id = j.client_id
        WHERE (p_assignee IS NULL OR t.assignee_id = p_assignee) AND (p_show_done OR t.status <> 'feito')
    ) x;
$$;

CREATE OR REPLACE FUNCTION wp_client_overview(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_client jsonb;
BEGIN
    SELECT to_jsonb(c) INTO v_client FROM clients c WHERE c.id = p_id;
    IF v_client IS NULL THEN RAISE EXCEPTION 'Cliente % não existe', p_id; END IF;
    RETURN jsonb_build_object(
        'client', v_client,
        'contacts', (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.is_primary DESC, k.name), '[]'::jsonb) FROM contacts k WHERE k.client_id = p_id),
        'jobs', wp_list_jobs(p_id),
        'quotes', wp_list_quotes(p_id),
        'retainers', wp_list_retainers(p_id),
        'billed_net_cents', (SELECT coalesce(sum(round(i.quantity * i.unit_price_cents)), 0)::bigint
                             FROM jobs j JOIN job_items i ON i.job_id = j.id
                             WHERE j.client_id = p_id AND j.status = 'Entregue')
    );
END $$;

CREATE OR REPLACE FUNCTION wp_get_job(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_job jsonb;
BEGIN
    SELECT x INTO v_job FROM (
        SELECT to_jsonb(j) || jsonb_build_object(
            'client_name', c.name,
            'quote_number', (SELECT q.number FROM quotes q WHERE q.id = j.quote_id),
            'repeat_ref', (SELECT r.reference FROM jobs r WHERE r.id = j.repeat_of_job_id)) AS x
        FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = p_id
    ) s;
    IF v_job IS NULL THEN RAISE EXCEPTION 'Trabalho % não existe', p_id; END IF;
    RETURN v_job || jsonb_build_object(
        'items', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.position, i.id), '[]'::jsonb) FROM job_items i WHERE i.job_id = p_id),
        'tasks', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY (t.status = 'feito'), t.due_date NULLS LAST, t.id), '[]'::jsonb)
                  FROM (SELECT t0.*, u.name AS assignee_name FROM tasks t0 LEFT JOIN users u ON u.id = t0.assignee_id
                        WHERE t0.job_id = p_id) t),
        'files', wp_list_files(NULL, p_id));
END $$;

CREATE OR REPLACE FUNCTION wp_get_quote(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_q jsonb;
BEGIN
    SELECT x INTO v_q FROM (
        SELECT to_jsonb(q) || jsonb_build_object(
            'client_name', c.name, 'client_email', c.email, 'client_phone', c.phone,
            'client_address', c.address, 'client_tax_id', c.tax_id,
            'job_id', (SELECT j.id FROM jobs j WHERE j.quote_id = q.id LIMIT 1),
            'job_ref', (SELECT j.reference FROM jobs j WHERE j.quote_id = q.id LIMIT 1)) AS x
        FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.id = p_id
    ) s;
    IF v_q IS NULL THEN RAISE EXCEPTION 'Orçamento % não existe', p_id; END IF;
    RETURN v_q || jsonb_build_object(
        'lines', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.position, l.id), '[]'::jsonb) FROM quote_lines l WHERE l.quote_id = p_id));
END $$;

-- Ecrã «Hoje»: atrasos, próximos dias, contagem por estado e tarefas de quem está a usar a app.
CREATE OR REPLACE FUNCTION wp_home(p_today date, p_days integer DEFAULT 7, p_me bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_limit date := p_today + p_days;
    v_jobs jsonb;
    v_tasks jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.due_date, x.priority DESC), '[]'::jsonb) INTO v_jobs
    FROM (SELECT j.*, c.name AS client_name FROM jobs j JOIN clients c ON c.id = j.client_id
          WHERE j.status <> 'Entregue' AND j.due_date IS NOT NULL AND j.due_date <= v_limit) x;
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.due_date, x.priority DESC), '[]'::jsonb) INTO v_tasks
    FROM (SELECT t.*, u.name AS assignee_name, j.reference AS job_ref, coalesce(c.name, jc.name) AS client_name
          FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN jobs j ON j.id = t.job_id
               LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN clients jc ON jc.id = j.client_id
          WHERE t.status <> 'feito' AND t.due_date IS NOT NULL AND t.due_date <= v_limit) x;
    RETURN jsonb_build_object(
        'overdue_jobs', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_jobs) e WHERE (e ->> 'due_date')::date < p_today),
        'due_jobs',     (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_jobs) e WHERE (e ->> 'due_date')::date >= p_today),
        'overdue_tasks',(SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_tasks) e WHERE (e ->> 'due_date')::date < p_today),
        'due_tasks',    (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(v_tasks) e WHERE (e ->> 'due_date')::date >= p_today),
        'counts', (SELECT jsonb_object_agg(s.st, (SELECT count(*) FROM jobs j WHERE j.status = s.st))
                   FROM (VALUES ('Em orçamento'), ('Adjudicado'), ('Em produção'), ('Completo'), ('Entregue')) AS s(st)),
        'mine', CASE WHEN p_me IS NULL THEN '[]'::jsonb ELSE wp_list_tasks(p_me, false) END);
END $$;

-- Cópia de segurança: todas as tabelas.
CREATE OR REPLACE FUNCTION wp_dump() RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_res jsonb := '{}'::jsonb; v_t text; v_rows jsonb;
BEGIN
    FOREACH v_t IN ARRAY ARRAY['users','clients','contacts','suppliers','catalog_items','quotes','quote_lines',
                               'jobs','job_items','retainers','tasks','files'] LOOP
        EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), ''[]''::jsonb) FROM %I t', v_t) INTO v_rows;
        v_res := v_res || jsonb_build_object(v_t, v_rows);
    END LOOP;
    RETURN v_res;
END $$;

-- ---- escrita --------------------------------------------------------------------------

-- Criar/atualizar uma linha de uma tabela simples. Só escreve as chaves que vierem no JSON.
CREATE OR REPLACE FUNCTION wp_upsert(p_table text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_id bigint := nullif(p_data ->> 'id', '')::bigint;
    v_cols text[];
    v_list text;
    v_sets text;
    v_res jsonb;
BEGIN
    IF p_table NOT IN ('clients', 'contacts', 'suppliers', 'catalog_items', 'retainers', 'tasks', 'files') THEN
        RAISE EXCEPTION 'Tabela não permitida: %', p_table;
    END IF;
    SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table
      AND c.column_name NOT IN ('id', 'created_at') AND p_data ? c.column_name::text;
    IF v_cols IS NULL THEN RAISE EXCEPTION 'Sem dados para guardar'; END IF;

    IF v_id IS NULL THEN
        SELECT string_agg(format('%I', x), ', ') INTO v_list FROM unnest(v_cols) AS x;
        EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(null::%I, $1) RETURNING to_jsonb(%I.*)',
                       p_table, v_list, v_list, p_table, p_table) INTO v_res USING p_data;
    ELSE
        SELECT string_agg(format('%I = r.%I', x, x), ', ') INTO v_sets FROM unnest(v_cols) AS x;
        EXECUTE format('UPDATE %I t SET %s FROM jsonb_populate_record(null::%I, $1) r WHERE t.id = $2 RETURNING to_jsonb(t.*)',
                       p_table, v_sets, p_table) INTO v_res USING p_data, v_id;
        IF v_res IS NULL THEN RAISE EXCEPTION 'O registo já não existe (foi apagado noutro dispositivo?)'; END IF;
    END IF;

    IF p_table = 'contacts' AND coalesce((v_res ->> 'is_primary')::boolean, false) THEN
        UPDATE contacts SET is_primary = false
        WHERE client_id = (v_res ->> 'client_id')::bigint AND id <> (v_res ->> 'id')::bigint;
    END IF;
    RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION wp_delete(p_table text, p_id bigint) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF p_table NOT IN ('clients', 'contacts', 'tasks') THEN
        RAISE EXCEPTION 'Tabela não permitida: %', p_table;
    END IF;
    EXECUTE format('DELETE FROM %I WHERE id = $1', p_table) USING p_id;
END $$;

-- Remove o registo de um ficheiro e diz se o ficheiro ainda é usado por outro registo.
CREATE OR REPLACE FUNCTION wp_delete_file(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_path text; v_left bigint;
BEGIN
    DELETE FROM files WHERE id = p_id RETURNING storage_path INTO v_path;
    IF v_path IS NULL THEN RETURN jsonb_build_object('storage_path', NULL, 'remaining', 0); END IF;
    SELECT count(*) INTO v_left FROM files WHERE storage_path = v_path;
    RETURN jsonb_build_object('storage_path', v_path, 'remaining', v_left);
END $$;

CREATE OR REPLACE FUNCTION wp_complete_task(p_id bigint, p_today date) RETURNS void
LANGUAGE sql SET search_path = public AS $$
    UPDATE tasks SET status = 'feito', completed_at = p_today WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION wp_reopen_task(p_id bigint) RETURNS void
LANGUAGE sql SET search_path = public AS $$
    UPDATE tasks SET status = 'por fazer', completed_at = NULL WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION wp_save_quote(p_data jsonb, p_lines jsonb, p_today date) RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id bigint := nullif(p_data ->> 'id', '')::bigint; v_status text;
BEGIN
    IF v_id IS NULL THEN
        INSERT INTO quotes (number, client_id, issued_on, valid_until, notes, created_by)
        VALUES (wp_next_number('quotes', 'number', 'ORC', p_today), (p_data ->> 'client_id')::bigint, p_today,
                (p_data ->> 'valid_until')::date, nullif(p_data ->> 'notes', ''), nullif(p_data ->> 'created_by', '')::bigint)
        RETURNING id INTO v_id;
    ELSE
        SELECT status INTO v_status FROM quotes WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento % não existe', v_id; END IF;
        IF v_status = 'aceite' THEN
            RAISE EXCEPTION 'Um orçamento aceite já não pode ser alterado (criou um trabalho).';
        END IF;
        UPDATE quotes SET valid_until = (p_data ->> 'valid_until')::date, notes = nullif(p_data ->> 'notes', '') WHERE id = v_id;
        DELETE FROM quote_lines WHERE quote_id = v_id;
    END IF;
    PERFORM wp_insert_lines('quote_lines', v_id, p_lines);
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION wp_set_quote_status(p_id bigint, p_status text) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF p_status NOT IN ('rascunho', 'enviado', 'aceite', 'recusado') THEN
        RAISE EXCEPTION 'Estado de orçamento inválido: %', p_status;
    END IF;
    UPDATE quotes SET status = p_status WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION wp_delete_quote(p_id bigint) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM quotes WHERE id = p_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_status = 'aceite' OR EXISTS (SELECT 1 FROM jobs WHERE quote_id = p_id) THEN
        RAISE EXCEPTION 'Não se pode apagar um orçamento que já deu origem a um trabalho.';
    END IF;
    DELETE FROM quotes WHERE id = p_id;
END $$;

-- Aceitar: marca o orçamento como aceite e cria o trabalho «Adjudicado» com as mesmas linhas.
CREATE OR REPLACE FUNCTION wp_accept_quote(p_id bigint, p_title text, p_category text, p_due date, p_owner bigint,
                                           p_priority integer, p_today date) RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_q quotes; v_job bigint;
BEGIN
    SELECT * INTO v_q FROM quotes WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento % não existe', p_id; END IF;
    IF EXISTS (SELECT 1 FROM jobs WHERE quote_id = p_id) THEN
        RAISE EXCEPTION 'O orçamento % já tem um trabalho associado', v_q.number;
    END IF;
    IF v_q.status = 'recusado' THEN RAISE EXCEPTION 'O orçamento % foi recusado', v_q.number; END IF;

    INSERT INTO jobs (reference, client_id, title, category, status, priority, due_date, owner_id, quote_id)
    VALUES (wp_next_number('jobs', 'reference', 'T', p_today), v_q.client_id, p_title, coalesce(p_category, 'outro'),
            'Adjudicado', coalesce(p_priority, 2), p_due, p_owner, p_id)
    RETURNING id INTO v_job;
    INSERT INTO job_items (job_id, position, description, specs, quantity, unit_price_cents, vat_rate)
    SELECT v_job, l.position, l.description, l.specs, l.quantity, l.unit_price_cents, l.vat_rate
    FROM quote_lines l WHERE l.quote_id = p_id ORDER BY l.position, l.id;
    UPDATE quotes SET status = 'aceite' WHERE id = p_id;
    UPDATE clients SET status = 'ativo' WHERE id = v_q.client_id AND status = 'lead';
    RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION wp_save_job(p_data jsonb, p_items jsonb, p_today date) RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id bigint := nullif(p_data ->> 'id', '')::bigint;
BEGIN
    IF v_id IS NULL THEN
        INSERT INTO jobs (reference, client_id, title, category, priority, due_date, owner_id, invoice_ref, paid, notes)
        VALUES (wp_next_number('jobs', 'reference', 'T', p_today), (p_data ->> 'client_id')::bigint, p_data ->> 'title',
                coalesce(p_data ->> 'category', 'outro'), coalesce((p_data ->> 'priority')::int, 2),
                (p_data ->> 'due_date')::date, nullif(p_data ->> 'owner_id', '')::bigint,
                nullif(p_data ->> 'invoice_ref', ''), coalesce((p_data ->> 'paid')::boolean, false),
                nullif(p_data ->> 'notes', ''))
        RETURNING id INTO v_id;
    ELSE
        UPDATE jobs SET title = p_data ->> 'title', category = coalesce(p_data ->> 'category', 'outro'),
               priority = coalesce((p_data ->> 'priority')::int, 2), due_date = (p_data ->> 'due_date')::date,
               owner_id = nullif(p_data ->> 'owner_id', '')::bigint, invoice_ref = nullif(p_data ->> 'invoice_ref', ''),
               paid = coalesce((p_data ->> 'paid')::boolean, false), notes = nullif(p_data ->> 'notes', '')
        WHERE id = v_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Trabalho % não existe', v_id; END IF;
        DELETE FROM job_items WHERE job_id = v_id;
    END IF;
    PERFORM wp_insert_lines('job_items', v_id, p_items);
    RETURN v_id;
END $$;

-- Avança ou recua UM passo: Em orçamento → Adjudicado → Em produção → Completo → Entregue.
CREATE OR REPLACE FUNCTION wp_set_job_status(p_id bigint, p_status text, p_today date) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_order text[] := ARRAY['Em orçamento', 'Adjudicado', 'Em produção', 'Completo', 'Entregue'];
    v_cur text;
    v_step integer;
BEGIN
    IF array_position(v_order, p_status) IS NULL THEN RAISE EXCEPTION 'Estado inválido: %', p_status; END IF;
    SELECT status INTO v_cur FROM jobs WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trabalho % não existe', p_id; END IF;
    v_step := array_position(v_order, p_status) - array_position(v_order, v_cur);
    IF v_step NOT IN (-1, 1) THEN
        RAISE EXCEPTION 'Não é possível passar de «%» para «%»', v_cur, p_status;
    END IF;
    UPDATE jobs SET status = p_status, delivered_on = CASE WHEN p_status = 'Entregue' THEN p_today ELSE NULL END
    WHERE id = p_id;
END $$;

-- Repetir: novo trabalho «Em orçamento» com os mesmos itens e a arte final aprovada.
CREATE OR REPLACE FUNCTION wp_duplicate_job(p_id bigint, p_title text, p_due date, p_today date) RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_src jobs; v_new bigint;
BEGIN
    SELECT * INTO v_src FROM jobs WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trabalho % não existe', p_id; END IF;
    INSERT INTO jobs (reference, client_id, title, category, priority, owner_id, due_date, notes, repeat_of_job_id)
    VALUES (wp_next_number('jobs', 'reference', 'T', p_today), v_src.client_id, coalesce(nullif(btrim(p_title), ''), v_src.title),
            v_src.category, v_src.priority, v_src.owner_id, p_due, v_src.notes, p_id)
    RETURNING id INTO v_new;
    INSERT INTO job_items (job_id, position, description, specs, quantity, unit_price_cents, unit_cost_cents, vat_rate, supplier_id)
    SELECT v_new, i.position, i.description, i.specs, i.quantity, i.unit_price_cents, i.unit_cost_cents, i.vat_rate, i.supplier_id
    FROM job_items i WHERE i.job_id = p_id ORDER BY i.position, i.id;
    INSERT INTO files (client_id, job_id, name, kind, storage_path, version, approved, uploaded_by)
    SELECT f.client_id, v_new, f.name, f.kind, f.storage_path, f.version, true, f.uploaded_by
    FROM files f WHERE f.job_id = p_id AND f.approved AND f.kind = 'arte final';
    RETURN v_new;
END $$;


-- 4. SEGURANÇA -------------------------------------------------------------------------
-- Só quem está autenticado E autorizado (wp_is_member) lê ou escreve. O resto da internet não vê nada.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON team_members FROM authenticated;          -- a lista de autorizados só é lida pela função

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['meta','team_members','users','clients','contacts','suppliers','catalog_items','quotes',
                             'quote_lines','jobs','job_items','retainers','tasks','files'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS wp_team_only ON %I', t);
        IF t <> 'team_members' THEN   -- team_members fica sem política: ninguém a lê diretamente
            EXECUTE format('CREATE POLICY wp_team_only ON %I FOR ALL TO authenticated USING ((SELECT wp_is_member())) WITH CHECK ((SELECT wp_is_member()))', t);
        END IF;
    END LOOP;
END $$;


-- 5. ARMAZENAMENTO DE FICHEIROS (privado) -----------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES ('whiteprints-files', 'whiteprints-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS wp_files_team_only ON storage.objects;
CREATE POLICY wp_files_team_only ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'whiteprints-files' AND (SELECT public.wp_is_member()))
    WITH CHECK (bucket_id = 'whiteprints-files' AND (SELECT public.wp_is_member()));
