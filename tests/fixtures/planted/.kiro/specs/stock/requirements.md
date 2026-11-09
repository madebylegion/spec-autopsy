# Requirements Document

## Introduction

Stock keeping rules of the planted fixture. Not part of the real project.

## Requirements

### Requirement 1: Adjustments

**User Story:** As a clerk, I want stock changes recorded, so that counts stay right.

#### Acceptance Criteria

1. WHEN a stock adjustment is submitted, the stock ledger SHALL record the adjustment and a reason.
2. WHEN a negative quantity is entered, the quantity validator SHALL reject the entry.
3. IF the stock level falls below the reorder point, THEN the stock monitor SHALL raise a low stock flag.
4. WHEN a stock transfer is requested, the warehouse router SHALL assign a destination bin.

### Requirement 2: Purchasing

**User Story:** As a buyer, I want timely purchasing, so that shelves stay full.

#### Acceptance Criteria

1. WHEN stock runs low, the reorder service SHALL send an alert to the purchasing team.
2. WHEN a purchase order is approved, the purchasing module SHALL compute the supplier lead time.
3. WHEN a shipment arrives, the receiving dock SHALL update the on hand quantity.

### Requirement 3: Receiving

**User Story:** As a dock worker, I want pallets labelled and damage claimed, so that nothing gets lost.

#### Acceptance Criteria

1. WHEN a pallet is scanned at the gate, the sticker printer SHALL print a batch barcode.
2. WHEN a pallet is damaged, the claims desk SHALL open a claim file.
