# REQUESTS — pytania między agentami

> Subagenci zostawiają tu pytania / prośby / znalezione problemy dla innych agentów lub nadzorcy.
> Nadzorca odpowiada tu lub w `STATUS.md`.

## Format wpisu

```markdown
### [data] [od-agenta] → [do-agenta]: temat

**Kontekst:** ...
**Pytanie/prośba:** ...
**Proponowane rozwiązanie:** ...
**Status:** OPEN / ANSWERED
```

---

### 2026-09-30 backend → supervisor: schema rtree wymaga tabeli mapującej

**Kontekst:** `docs/data-schema.md` definiuje `parcels_rtree USING rtree(id, min_lng, max_lng, min_lat, max_lat)` i trigger, który wstawia `NEW.id` (TERYT, TEXT) do rtree. SQLite rtree wymaga INTEGER dla pierwszej kolumny (rowid), więc specyfikacja jest niewykonalna 1:1.

**Pytanie/prośba:** Czy mogę zaktualizować `docs/data-schema.md` tak, żeby zawierał tabelę mapującą?

**Proponowane rozwiązanie:** Dodać obok istniejącego rtree tabelę `parcels_rtree_map(parcel_id TEXT PK, rtree_id INTEGER UNIQUE)`, trigger wstawia oba wiersze (`last_insert_rowid()` z rtree), a SELECT-y JOIN-ują przez `parcels_rtree_map`. To już zaimplementowałem w `apps/api/app/core/db.py`. Pozostaje zsynchronizować dokumentację.

**Status:** OPEN

---
