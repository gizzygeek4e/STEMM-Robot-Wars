# Security Specification — Robot Soccer Tournament

## 1. Data Invariants
1. Public spectators may read (`get` / `list`) tournament metadata, teams, and matches only where `visibility == 'public'`.
2. Only verified administrators (`request.auth.token.email_verified == true` and either bootstrapped email `hermanf@gisboyshigh.net` or presence in `/admins/{uid}`) may create, update, or delete tournament, team, or match documents.
3. No unauthenticated or non-admin user may write to any collection or read `/admins/{userId}` records belonging to another user.
4. All document IDs must match `^[a-zA-Z0-9_-]+$` and stay `<= 128` characters.
5. `createdAt` is immutable on updates and must equal `request.time` on creation; `updatedAt` must equal `request.time` on creation and updates.
6. Array fields (`robots` <= 10, `events` <= 50) and all string fields have strict `.size()` bounds.

## 2. Dirty Dozen Attack Payloads
1. Unauthenticated write to `/matches/qf-1` -> `PERMISSION_DENIED`
2. Non-admin authenticated user updating `homeScore` on `/matches/qf-1` -> `PERMISSION_DENIED`
3. Spoofed admin email with `email_verified: false` -> `PERMISSION_DENIED`
4. Shadow field injection (`isAdmin: true`) in `/teams/t1` create -> `PERMISSION_DENIED`
5. Self-assigning admin role via write to `/admins/{uid}` -> `PERMISSION_DENIED`
6. Oversized document ID (>128 chars or invalid chars) -> `PERMISSION_DENIED`
7. Client-forged `createdAt` timestamp on create -> `PERMISSION_DENIED`
8. Mutating immutable `createdAt` on `/matches/qf-1` update -> `PERMISSION_DENIED`
9. Oversized string (>120 chars) in `team.name` -> `PERMISSION_DENIED`
10. Unbounded array (>10 robots) in `team.robots` -> `PERMISSION_DENIED`
11. Invalid match status (`"hacked"`) on `/matches/qf-1` -> `PERMISSION_DENIED`
12. Negative score (`homeScore: -5`) on `/matches/qf-1` -> `PERMISSION_DENIED`
