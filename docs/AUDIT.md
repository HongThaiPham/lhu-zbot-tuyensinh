# Audit

## Model

Phase 3 introduces append-oriented `audit_logs`:

- `id`
- `actor_user_id` (nullable for system flows)
- `action`
- `entity_type`
- `entity_id`
- `metadata` (JSON)
- `created_at`

Indexed by actor, timestamp, and action/entity lookup patterns.

## Security exclusions

Audit metadata must never include:

- plaintext passwords
- password hashes
- raw session tokens
- session token hashes
- API keys
- encryption keys
- cookie values
- authorization headers

## Canonical service

`AuditService` is the single write path used by Phase 3 security-sensitive mutations.

Audited events include:

- bootstrap admin creation
- bootstrap role assignment
- ADMIN user status mutation

## Transactional guarantee

For important mutations, business write + audit insert run in one Prisma transaction.
If audit insertion fails, the mutation is rolled back.

Phase 3 tests and integration verification cover this path through `PATCH /admin/users/:id/status`.
