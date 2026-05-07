# Security Specification

## Data Invariants
- A `Medication` document must have `num`, `clave`, `nombre`, `stock_actual` (number), `createdAt`, and `updatedAt`.
- A `LogEntry` document must have `folio`, `cantidad` (number), `createdAt`, and reference a valid `medicationId`.

## The "Dirty Dozen" Payloads
1. Medication with missing required field
2. Medication with invalid `num` (e.g. string)
3. Medication with invalid `stock_actual` (e.g. object)
4. Medication Update missing `updatedAt` update
5. LogEntry with missing `folio`
6. LogEntry with invalid `cantidad`
7. LogEntry referencing non-existent medicationId
8. LogEntry with spoofed `createdAt` not equaling `request.time`
9. Updating `Medication` `createdAt` field (should be blocked)
10. Adding unexpected field to Medication
11. Adding unexpected field to LogEntry
12. Attempt to write by unauthenticated user

## Test Runner
The tests are implemented in `firestore.rules.test.ts`.
