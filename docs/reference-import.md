# Reference Import

This project includes a reference-data importer for the two Google Drive TSV files we reviewed:

- `Sales Orders Jan-April 2026 - Amcad Graphic.tsv`
- `Stock Counts in La Mirada Warehouse - Import to ERP.tsv`

The importer is intentionally split into two safe paths:

- `stock`: imports SKU master data and opening stock counts
- `sales`: imports historical sales orders without creating reservations or outbound inventory movements

This avoids corrupting inventory when the stock file and sales file use different business units.

## Commands

Run a dry run first:

```bash
cd "/Users/davidz/Documents/New project/backend"
npm run import:reference -- --dry-run
```

Import only stock:

```bash
cd "/Users/davidz/Documents/New project/backend"
npm run import:reference -- --mode stock
```

Import only sales:

```bash
cd "/Users/davidz/Documents/New project/backend"
npm run import:reference -- --mode sales
```

Import both:

```bash
cd "/Users/davidz/Documents/New project/backend"
npm run import:reference
```

## Defaults

The script already defaults to the two Drive TSV files:

- Sales source: `1rB0b327-Qy6iZXb-ykj8RU5orMa5cNYG`
- Stock source: `1gHFzHrYNvFdbD-twKzUNQQ2qTlUqtAfB`
- Import user: `admin@gt.local`
- Inventory unit: `CTN`
- Sales unit: `ROLL`
- Warehouse location: `La Mirada Warehouse`

## Optional Overrides

```bash
npm run import:reference -- \
  --mode sales \
  --sales-source "/absolute/path/to/sales.tsv" \
  --stock-source "/absolute/path/to/stock.tsv" \
  --user-email "admin@gt.local" \
  --inventory-unit "CTN" \
  --sales-unit "ROLL" \
  --warehouse-location "La Mirada Warehouse"
```

## Notes

- Stock imports upsert `skus` by `skuCode`.
- Stock quantities are applied as physical-count style adjustments.
- Sales imports upsert `customers` by `companyName`.
- Sales imports create missing SKUs from the sales sheet when needed.
- Sales imports store source-only fields such as `Invoice #`, `Ship Date`, `PO #`, `Ship Method`, and `Sales Rep` inside order `notes`.
- Sales imports detect duplicates by searching for `Original Invoice #:` in the existing order notes.
- Historical sales orders are imported as:
  - `SHIPPED` when `Ship Date` exists
  - `DRAFT` when `Ship Date` is blank
