### What changed
- [ ] Data only  |  [ ] App code  |  [ ] Layout/meta

### Checklist
- [ ] Only `order-helper/data/` is used (no `order-helper/Data/` dir)
- [ ] `rules.json` validates against `order-helper/schema/rules.schema.json`
- [ ] I bumped the version in layout metas (`oh-version` and `?v=`) when changing rules
- [ ] Dropdowns populate locally (debug page shows OK)
- [ ] No merge markers; JSON is valid (no trailing commas)