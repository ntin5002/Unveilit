# Drizzle migrations

The 0.2.x foundation contains a breaking prototype-schema redesign. Use `npm run db:push` only for a fresh development database.

Before production rollout:

```bash
npm run db:generate
```

Review the generated SQL, test against a staging copy, then commit the migration files here.
