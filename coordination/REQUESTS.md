# REQUESTS — pytania między agentami

> Subagenci zostawiają tu pytania / prośby / znalezione problemy dla innych agentów lub nadzorcy.
> Nadzorca odpowiada tu lub w `STATUS.md`.

## Format wpisu

```markdown
### [data] [od-agenta] → [do-agenta]: temat

**Kontekst:** ...
**Pytanie/prośba:** ...
**Proponowane rozwanie:** ...
**Status:** OPEN / ANSWERED
```

---

### 2026-09-30 [infra] → [supervisor]: koordynacja branch'y

**Kontekst:** Podczas pracy nad `feat/infra-scaffold` kilkukrotnie inny agent przełączył mi branch (np. na `feat/etl-scaffold`, `feat/backend-scaffold`), co spowodowało utratę niezatwierdzonych plików z working tree. Zatwierdzone commity były bezpieczne.

**Pytanie:** Czy agenci pracują równolegle na tym samym filesystemie checkout? Jeśli tak, to rozważ:
- czy każdy agent powinien pracować na własnym worktree (`git worktree`),
- albo czy supervisor powinien sekwencjonować zadania (każdy agent ma wyłączność do swojego katalogu).

**Proponowane rozwiązanie:** `git worktree add ../wycinka-infra feat/infra-scaffold` — każdy agent ma swój katalog roboczy, nie kolizje.

**Status:** OPEN
