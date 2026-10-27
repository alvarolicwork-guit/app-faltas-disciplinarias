---
name: memorandum-engine
description: Design and implement reusable memorandum workflows with configurable legal templates, controlled print output, content editing, and traceability across modules.
---

# Memorandum Engine Skill

## Purpose

This skill provides a professional, reusable pattern for building institutional memorandum flows in application modules.

It is designed to preserve a strong, formal document structure while remaining configurable per project and per module.

The skill standardizes:

- memorandum visual composition
- recipient and authority resolution
- legal-content templating
- controlled content editing
- print behavior
- issuance traceability and reprint control

This skill is **project-local and opt-in**. It is not meant to enforce one global legal text across repositories.

---

## When to use this skill

Use this skill when a module needs to:

- generate formal memorandums (assignment, vacation, disciplinary, administrative, etc.)
- print or export a legal-like institutional document
- apply role- or state-based wording changes
- keep an auditable record of issued documents
- support controlled content customization by operators

Do not use this skill for generic reports, dashboards, or ad-hoc printable screens without issuance control.

---

## Core Principles

1. **Single flow**
   - `open memo -> validate -> persist trace -> print`

2. **Config over hardcode**
   - authority lookup, legal body, labels, and document keys are configurable.

3. **Institutional consistency**
   - preserve formal layout blocks and signature hierarchy.

4. **Controlled flexibility**
   - allow exceptional wording edits with safe formatting, not free HTML.

5. **Traceability first**
   - no print without pre-print validation and registry update.

---

## Required Data Contract

Any module integrating this skill should provide a memo payload with at least:

```ts
type MemoPayload = {
  nroMemo: string
  anioMemo: string
  fechaMemo: string // ISO date
  ciudadMemo: string
  destinatario: {
    personalId?: string
    nombre: string
    grado: string
    sexo?: string
    escalafon?: string
    ci?: string
  }
  autoridad: {
    grado: string
    nombre: string
    cargoFirma: string
    iniciales?: string
  }
  modulo: string
  tramiteId?: string
  contenido?: {
    referencia: string
    saludo: string
    parrafo1: string
    parrafo2?: string
    cierre: string
    lema?: string
  }
  contenidoPersonalizado?: boolean
}
```

---

## Configuration Model (Per Project)

Define a local configuration for each project/module implementation:

```ts
type MemoEngineConfig = {
  collectionName: string // e.g. memorandums_reasignacion
  memoKeyFormat: 'anio-nro'
  authorityLookup: {
    sourceCollection: string // e.g. personal
    activeStateField: string // e.g. estado
    activeStateValue: string // e.g. activo
    roleField: 'cargo' | 'cargos'
    roleMatch: 'eq' | 'array-contains'
    roleValue: string
  }
  printProfile: {
    pageSize: string // e.g. auto, A4, 216mm 165mm
    margin: string // e.g. 10mm
    isolateDocument: boolean
  }
  textRules: {
    genderVocative: boolean
    literalRankMapping: boolean
    allowInlineFormatting: boolean // **bold**, _italic_
  }
}
```

The skill should be adapted with this configuration, not by rewriting core behavior each time.

---

## Visual Structure Standard

A memorandum should keep this document hierarchy:

1. **Title block** (`MEMORÁNDUM`)
2. **Institutional header table**
   - left: institution, shield, internal series
   - right: recipient block + escalafon
3. **Reference line** (`REF: ...`)
4. **Salutation** (`Señor/Señora + grado literal`)
5. **Body paragraphs**
6. **Closing line**
7. **Institutional motto**
8. **Signature block**
9. **Initials + archive line**

Do not flatten this structure unless the target institution explicitly requires a different format.

---

## Wording Rules

### 1) Recipient Vocative by Sex

Support:

- `Al Señor` / `A la Señora`
- `Señor` / `Señora`

Use tolerant normalization for sex values (`femenino`, `fem`, etc.).

### 2) Literal Rank Mapping

Implement canonical rank mapping with legacy tolerance (uppercase, punctuation variants).

Examples:

- `Cap.` -> `Capitan`
- `Sgto. 1ro.` -> `Sargento Primero`
- `Tcnl. DEAP` -> `Teniente Coronel DEAP`

### 3) Legal Body by Template Type

Document body must be selected by template key (e.g. `reasignacion_con_reemplazo`, `vacacion_anual`).

---

## Editing Model

When `Editar Contenido` is enabled:

- only document-content zones become editable
- structural metadata (keys, authority identity, dates) remains validated
- formatting markers allowed:
  - `**text**` -> bold
  - `_text_` -> italic
- HTML injection is forbidden

Keep a boolean flag:

- `contenidoPersonalizado: true|false`

Persist edited content as part of traceability.

---

## Traceability Rules

Before print, validate and persist:

1. required fields (`nroMemo`, `anioMemo`, `fechaMemo`, authority)
2. key uniqueness under `memoKey = anio-nro`
3. linkage to module transaction (`tramiteId`, `personalId`, etc.)

Reprint behavior:

- if same transaction: increment `printCount`
- if different transaction: reject duplicate key

Recommended fields:

```ts
{
  key,
  tipo,
  correlativo,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  firstPrintedAt,
  lastPrintedAt,
  printCount,
  contenido,
  contenidoPersonalizado
}
```

---

## Print Rules

Print mode must:

- isolate only the memorandum content
- hide app shell, controls, and side panels
- avoid CSS rules that break table semantics (`display:block` on `tr/td`)
- prevent multi-page artifacts from hidden layout blocks
- keep document readable in PDF and physical print

Browser header/footer metadata is controlled by browser print options and should be documented to operators.

---

## Implementation Workflow

When applying this skill in a module:

1. define module config (`collectionName`, authority lookup, template key)
2. implement memo modal component
3. integrate trigger from business action (e.g. complete execution)
4. connect `onBeforePrint` persistence
5. run functional checks (recipient sex, rank variants, authority autoload)
6. validate print output
7. document decisions in project memory files

---

## Quality Checklist

Before closing implementation, confirm:

- [ ] vocative reflects recipient sex
- [ ] rank renders in literal form
- [ ] authority autoload uses canonical active role
- [ ] memo key duplicate logic works
- [ ] edited content prints cleanly
- [ ] print shows only one isolated document view
- [ ] registry updates before print
- [ ] reprints update `printCount`

---

## Reuse Notes

This skill is intentionally versatile:

- keep the structure fixed
- swap legal content templates
- swap authority lookup rules
- swap registry collection names

This ensures consistency across projects without forcing one institution-specific law text globally.

---

## Anti-Patterns to avoid

- hardcoding signatory names in component output
- skipping persistence and printing directly
- using raw rich-text HTML from user input
- binding rank mapping to exact case-sensitive strings only
- duplicating memo logic per module without a shared pattern

---

## Success Criteria

This skill is successful when:

- new modules can add memorandum issuance quickly
- documents remain institutionally consistent
- wording can adapt to module/legal context
- print outputs are stable
- every issued memorandum is auditable
