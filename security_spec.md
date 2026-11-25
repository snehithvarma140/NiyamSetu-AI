# NiyamSetu AI Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: Any unspecified collection or document path is denied by the global catch-all rule.
2. **PII Isolation (`/users/{userId}`)**: User profiles containing `email`, `phone`, `dateOfBirth`, `guardianName`, `address`, `bankIfsc`, `bankAccountLast4`, certificate numbers, and saved financial thresholds (`savedIncome`) can only be `get`-read by the owner (`request.auth.uid == userId`) or a verified admin. Non-admin `list` queries on `/users` are denied.
3. **No Self-Privilege Escalation**: On `/users/{userId}` creation or update, a non-admin user can only create or retain `role == 'STUDENT'`, and cannot mutate `uid`, `createdAt`, or `role`.
4. **Bookmark & Memorized Document Ownership (`/saved_bookmarks/{bookmarkId}`, `/user_documents/{docId}`)**: Bookmarks and memorized documents strictly enforce `ownerId == request.auth.uid` on `get`, `list`, `create`, `update`, and `delete`. Terminal `status == 'ready'` bookmarks lock status transitions unless overridden by an admin.
5. **Email Verification & Server Timestamps**: All authenticated writes require `request.auth.token.email_verified == true` and enforce `createdAt == request.time` / `updatedAt == request.time`.
6. **ID & Size Hardening**: All path IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string/number field has explicit type and size bounds (`address <= 300`, `institutionName <= 180`, `notes <= 1000`).

## 2. Dirty Dozen Adversarial Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated read of `/users/u1` or `/user_documents/d1`**: No `request.auth` -> denied.
2. **Cross-user read of `/users/victim_uid` or `/user_documents/victim_doc` as `attacker_uid`**: `request.auth.uid != ownerId` and not admin -> denied.
3. **Unverified email admin spoof**: `email == 'snehithvarma140@gmail.com'` with `email_verified: false` -> denied.
4. **Self-escalation on user create**: `POST /users/{uid}` with `role: 'PLATFORM_ADMIN'` or `role: 'DEVELOPER'` -> denied.
5. **Shadow ghost field on user create**: `POST /users/{uid}` adding `isAdmin: true` -> rejected by `keys().hasOnly(...)`.
6. **Role mutation on user update**: `PATCH /users/{uid}` modifying `role` -> rejected by `affectedKeys().hasOnly(...)`.
7. **Timestamp spoofing**: `POST /saved_bookmarks/{id}` or `/user_documents/{id}` with backdated `createdAt` (`!= request.time`) -> denied.
8. **Cross-user document creation**: `/user_documents/{id}` with `ownerId: 'victim_uid'` while signed in as `'attacker_uid'` -> denied.
9. **Blanket list scraping on `/saved_bookmarks` or `/user_documents`**: `list` query without `where('ownerId', '==', auth.uid)` -> denied because `resource.data.ownerId == request.auth.uid` fails.
10. **Oversized ID injection**: Path `/user_documents/<200-char-junk>` -> denied by `isValidId()`.
11. **Oversized note/address DoW attack**: `note`/`notes` > 1,000 chars or `address` > 300 chars -> denied by field size guards.
12. **Client write to `/admins/{uid}`**: Attempt by regular authenticated user -> denied.
