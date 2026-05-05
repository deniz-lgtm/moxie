# Moxie — agent rules

## Supabase migrations

When you add a new `supabase/migrations/*.sql` file, also apply it to the
`moxie-apps` Supabase project (ref `muqogvuahmuaayrjhxft`) using the
Supabase MCP `apply_migration` tool before reporting the task as done.
The repo file stays as the source of truth (so the migration is checked
in), but the change must also be live in the database — otherwise the
app will hit "column does not exist" errors against the deployed schema.

If `apply_migration` reports an error (e.g. duplicate migration name),
inspect with `list_migrations` / `execute_sql` to see what's already
there before retrying.
