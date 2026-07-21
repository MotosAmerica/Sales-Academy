# Motos America Sales Academy — Web Training Site

A mobile-friendly web version of the Sales Academy manual: read all 21 modules,
take instantly-scored quizzes, and unlock two full Part exams. Managers get a
report showing who's registered and what they've completed.

## What's in this repo

| File | Purpose |
|---|---|
| `index.html` | Page shell — loads everything else |
| `styles.css` | All visual design (charcoal + steel-blue, matches the printed manual) |
| `content-data.js` | All 21 modules + every quiz question, generated from the locked manual |
| `app.js` | All app logic — login, navigation, quiz scoring, Supabase calls |
| `supabase-config.js` | **You fill this in** — your Supabase project keys |
| `schema.sql` | Run this once in Supabase to create the database tables |

## One-time setup (do this before sharing the link with your team)

### 1. Create a free Supabase project
- Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty for ~50 users)
- Create a new project. Pick any name/region/password (save the password somewhere, but you won't need it day-to-day)
- Wait ~2 minutes for the project to finish provisioning

### 2. Create the database tables
- In your Supabase project, open the **SQL Editor** (left sidebar)
- Open `schema.sql` from this repo, copy all of it, paste it into the SQL Editor, and click **Run**
- You should see "Success. No rows returned" — that means the two tables (`trainees` and `quiz_attempts`) were created

**Before running it:** open `schema.sql` and check the store names on this line:
```sql
store text not null check (store in ('Triumph Store', 'BMW + Triumph Store')),
```
Change `'Triumph Store'` and `'BMW + Triumph Store'` to your actual store names if these aren't right, and also update the same two names in `app.js` (search for `STORE_OPTIONS`).

### 3. Connect the site to your Supabase project
- In Supabase, go to **Project Settings → API**
- Copy the **Project URL**
- Copy the **anon public** key (NOT the `service_role` key — that one must stay secret)
- Open `supabase-config.js` in this repo and paste them in:
```js
window.SUPABASE_URL = "https://your-project-ref.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs...(long string)...";
```

### 4. Turn on GitHub Pages
- In this repo on GitHub: **Settings → Pages**
- Under "Source," choose **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Save. GitHub will give you a URL like `https://motosamerica.github.io/sales-academy/` within a minute or two

### 5. Give yourself manager access
- Log into the site once using your name, your store, and select **Manager** as the role
- Managers see an extra "Report" button in the top bar showing every trainee's progress

That's it — share the GitHub Pages URL with your team.

## Notes

- **No passwords.** Trainees log in with just their name and store. This is meant for internal use only — don't link this URL anywhere public.
- **Works offline-ish.** If wifi drops mid-quiz, the score still saves on the device and syncs to the shared database automatically once the connection is back.
- **Content changes:** if the manual content ever changes, `content-data.js` needs to be regenerated from the source — it isn't meant to be hand-edited directly.
