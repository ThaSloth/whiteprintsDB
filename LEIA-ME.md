# Whiteprints — app no browser

A mesma app do Mac, mas a correr numa página web: abre em qualquer computador (Safari, Chrome…), os dados ficam no Supabase e os ficheiros dos clientes também. Não é preciso instalar nada nem usar o Terminal.

**Como funciona:** os ficheiros desta pasta são só o "ecrã" (código). Ficam alojados no GitHub Pages (grátis). Tudo o que é vosso (clientes, trabalhos, ficheiros) fica no Supabase, atrás de email + palavra-passe. Só as duas contas que criarem lá conseguem ver dados.

Faça as partes 1 → 2 → 3, uma vez só (≈ 20 minutos).

---

## Parte 1 — Supabase (a base de dados)

1. Entre em supabase.com, crie conta (ou reutilize a que já tem) e clique em **New project**. Nome: `whiteprints`. Escolha uma região na Europa. Guarde a palavra-passe da base de dados num sítio seguro (não a vai usar na app).
2. Crie as **duas contas de utilizador** (André e Marina): menu **Authentication → Users → Add user → Create new user**. Email + palavra-passe para cada uma, e deixe ligada a opção **Auto Confirm User**.
3. Em **Authentication**, nas definições de início de sessão (*Sign In / Providers*), **desligue "Allow new users to sign up"**. Assim ninguém mais se consegue registar.
   *(Mesmo que se esqueça disto, a app só mostra dados a emails que estejam na lista criada no passo 4.)*
4. **SQL Editor → New query**. Abra o ficheiro `supabase_setup.sql` desta pasta com o TextEdit, copie **tudo**, cole no Supabase e clique **Run**. Deve aparecer "Success". Se criar outra conta mais tarde, volte a colar e correr o mesmo ficheiro (não apaga nada).
5. Copie dois valores: em **Project Settings → API** (ou no botão **Connect**):
   - **Project URL** (`https://xxxx.supabase.co`)
   - a chave **anon / public** (também pode aparecer como *publishable*).

   ⚠️ **Nunca** use a chave `service_role` / *secret*. A `anon` pode ser pública: sozinha não dá acesso a nada.

---

## Parte 2 — GitHub (onde a página fica alojada, grátis)

1. Em github.com crie conta e clique em **New repository**. Nome: `whiteprints`. Escolha **Public** (o GitHub Pages gratuito só funciona com repositório público) e **Create repository**.
2. Na página do repositório clique em **uploading an existing file** e arraste para lá o **conteúdo desta pasta**: as pastas `app`, `assets`, `vendor` e os ficheiros `index.html`, `config.js`, `styles.css` (e `.nojekyll`, que é invisível no Mac — se não o conseguir ver, não faz mal). Se o Safari não aceitar as pastas, use o Chrome. Clique **Commit changes**.
3. Abra o ficheiro `config.js` no GitHub (ícone do lápis ✏️), cole o **Project URL** e a chave **anon** entre as aspas e faça **Commit changes**.
4. **Settings → Pages**. Em *Source* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, **Save**. Ao fim de um ou dois minutos o GitHub mostra o endereço da app, do género `https://O-SEU-UTILIZADOR.github.io/whiteprints/`.

> O repositório público só contém o código da app — não tem nenhum dado vosso nem palavras-passe. A página tem `noindex` para não aparecer no Google.

---

## Parte 3 — Usar

1. Abra o endereço, entre com o email e palavra-passe criados na Parte 1 e escolha **André** ou **Marina** (serve para as tarefas e "quem faz o quê"; pode trocar em *Trocar de pessoa*).
2. Guarde o endereço nos favoritos. No Safari mais recente pode também usar **Ficheiro → Adicionar ao Dock** para ter um ícone como uma app.
3. Primeiros passos: **Catálogo** → defina os preços → **Clientes** → **+ Novo cliente** → **+ Orçamento** → **Aceitar e criar trabalho**.

*Se preferir não editar o `config.js`:* deixe-o vazio; a app pede o URL e a chave num ecrã "Ligar à cloud" e guarda-os nesse browser (uma vez em cada computador).

---

## O que a app faz (igual à app do Mac)

- **Hoje**: atrasos, próximos 7 dias, as minhas tarefas e contagem por estado.
- **Clientes** + ficha (trabalhos, orçamentos, ficheiros, contactos, avenças) · **Trabalhos** (itens com custo e margem, estados Em orçamento → Adjudicado → Em produção → Completo → Entregue, repetir trabalho) · **Orçamentos** (numeração ORC-AAAA-NNN, aceitar → cria o trabalho, **Exportar PDF**) · **Tarefas** · **Avenças** · **Catálogo**.
- **Ficheiros** guardados na cloud, organizados por cliente e trabalho; só a arte final aprovada passa para o trabalho repetido.
- **Cópia de segurança** (menu lateral): descarrega um ZIP com um CSV por tabela. Os ficheiros de clientes não vão no ZIP — ficam no Supabase.
- **Exportar PDF**: abre a janela de impressão; escolha *Guardar como PDF*.

## Se algo correr mal

| Sintoma | O que fazer |
|---|---|
| Ecrã "Ligar à cloud" | O `config.js` está vazio ou mal gravado — cole outra vez o URL e a chave. |
| "Email ou palavra-passe incorretos" | Confirme a conta em *Authentication → Users* (e que tem *Auto Confirm*). |
| "Sem acesso" | A conta foi criada depois de correr o SQL: corra `supabase_setup.sql` outra vez. |
| "Invalid API key" / erros de ligação | A chave foi copiada incompleta, ou é a errada (use a `anon`). |
| Alterações não aparecem no GitHub Pages | Aguarde 1–2 minutos e recarregue com ⌘⇧R. |
| Não consigo enviar um ficheiro grande (vídeo) | O Supabase limita o tamanho por ficheiro no plano gratuito; para vídeos grandes guarde-os noutro sítio e registe o nome no trabalho. |

## Atualizar a app

Se receberem uma versão nova, no GitHub abra o ficheiro, ✏️ editar, cole o novo conteúdo e *Commit*; ou **Add file → Upload files** por cima. O `config.js` mantém-se como está.

## Alojar noutro sítio (em vez do GitHub)

É um site estático: serve qualquer alojamento de ficheiros. Cloudflare Pages e Netlify têm planos gratuitos com envio por arrastar a pasta — mas confirme as condições atuais no site deles. Qualquer um serve; o Supabase é que guarda os dados.
