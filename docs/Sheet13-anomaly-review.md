# Sheet13 Anomaly Review

Source:

- [Sheet13 normalized preview](/Users/davidz/Documents/New%20project/docs/Sheet13-normalized-preview.tsv:1)
- Raw file: `/Users/davidz/Downloads/Stock Counts in La Mirada Warehouse - Sheet13.tsv`

## Summary

Detected anomaly groups:

- `5` rows with invalid or non-standard pallet locations
- `7` rows with missing or placeholder category values
- `1` row with a suspicious SKU code format
- multiple SKUs with inconsistent product names or conflicting categories

## 1. Invalid Pallet Location Rows

Current cleanup decision:

- all missing or invalid pallet values in this group are normalized to `Unknown Pallet Location`
- keep them there for now until physical stock check confirms the correct pallet

These rows should still be treated as exception stock until a real pallet is identified.

| Pallet Location | SKU | Count | Note |
|---|---|---:|---|
| `1000-H01X-GP-Sample` | `1000-H01X-GP-Sample` | 7 | Normalize to `Unknown Pallet Location` because pallet field looks like SKU |
| `—` | `1000-4202X-GP-Sample` | 1 | Normalize to `Unknown Pallet Location` |
| `—` | `1000-H01X-20GP` | 1 | Normalize to `Unknown Pallet Location` |
| `—` | `1000-H01X-30GP` | 1 | Normalize to `Unknown Pallet Location`; SKU manually confirmed during review |
| `—` | `1000-P990-GP-Sample` | 1 | Normalize to `Unknown Pallet Location` |

## 2. Missing Or Placeholder Category

Current cleanup decision:

- the 7 rows below now have assigned categories based on manual review
- they no longer count as unresolved missing-category rows
- keep them listed here as a record of the cleanup

| Pallet Location | SKU | Count | Current Category |
|---|---|---:|---|
| `04A06-1` | `1000-H01X-GP` | 2 | `Standard` |
| `04A23-2` | `1000-H01X-30GP` | 3 | `Standard` |
| `04A25-1` | `1000-152R-20GP` | 3 | `Standard` |
| `Unknown Pallet Location` | `1000-4202X-GP-Sample` | 1 | `Sample` |
| `Unknown Pallet Location` | `1000-H01X-20GP` | 1 | `Standard` |
| `Unknown Pallet Location` | `1000-H01X30GP` | 1 | `Standard` |
| `Unknown Pallet Location` | `1000-P990-GP-Sample` | 1 | `Sample` |

## 3. Suspicious SKU Format

Current cleanup decision:

- corrected trailing-dash typo
- confirmed `1000-H01X-30GP` is the correct SKU format for the unknown-pallet row that originally appeared without the separator

| Pallet Location | SKU | Count | Note |
|---|---|---:|---|
| `04A13-1` | `1000-4201X-30GP` | 1 | Corrected from `1000-4201X-30GP-` |

## Manual Confirmation Notes

Confirmed during review:

- `Unknown Pallet Location` entries should stay as-is until physical stock check is complete
- `1000-H01X-30GP` is the correct SKU format
- `1000-4202X-GP` is definitively `54" Gold Chrome Standard`
- pallet codes like `04A02-1` and `05A11-2` are valid La Mirada pallet formats

## 4. SKU Name Conflicts

Current cleanup decision:

- normalize each SKU to a single master product name before import
- use the simpler, newer product naming convention provided during review

| SKU | Approved Master Product Name |
|---|---|
| `1000-151-GP` | `54" Gloss White Permanent Standard` |
| `1000-151-GP-Short` | `54" Gloss White Short Size` |
| `1000-152-GP` | `54” 6mil high matte white permanent Standard` |
| `1000-152R-GP` | `54" Matte White Removable Standard` |
| `1000-4202X-GP` | `54" Gold Chrome Standard` |
| `1000-H01X-20GP` | `20" Holographic Silver Standard` |
| `1000-H01X-GP` | `54" Holographic Silver Standard` |
| `1000-H01X-GP-Short` | `54" Holographic Silver Short Size` |

## 5. Category Conflicts

Current cleanup decision:

- normalize these SKUs to approved master categories before import

| SKU | Approved Master Category |
|---|---|
| `1000-151-GP` | `Standard` |
| `1000-151-GP-Short` | `Short Size` |
| `1000-4202X-GP-Sample` | `Sample` |
| `1000-H01X-20GP` | `Standard` |
| `1000-P990-GP-Sample` | `Sample` |

## Recommendation

Safe to use directly for pallet reference:

- normal pallet codes like `04A02-1`, `04A09-1`, `05A11-2`
- `SKU + Pallet Location + Count`

Do not use directly without review:

- invalid pallet rows
- conflicting product name rows
- conflicting category rows
- typo-like SKU rows
