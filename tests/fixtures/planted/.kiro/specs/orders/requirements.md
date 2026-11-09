# Requirements Document

## Introduction

Order handling rules of the planted fixture. Not part of the real project.

## Requirements

### Requirement 1: Checkout

**User Story:** As a customer, I want a clear checkout, so that I can pay and receive my goods.

#### Acceptance Criteria

1. WHEN a customer places an order, the order service SHALL calculate the order total including tax.
2. WHEN a parcel leaves the warehouse, the shipping module SHALL generate a tracking label.
3. IF a payment is declined, THEN the payment gateway SHALL notify the customer and keep the order open.
4. WHEN an order is cancelled, the order service SHALL release the reserved inventory.

### Requirement 3: Returns

**User Story:** As a customer, I want to send goods back, so that I get my money back.

#### Acceptance Criteria

1. WHEN a customer requests a refund, the returns desk SHALL issue a credit note.

### Requirement 2: Extras

**User Story:** As a shopper, I want discounts and gifts, so that ordering is pleasant.

#### Acceptance Criteria

1. WHEN a coupon code is entered, the discount engine SHALL apply the coupon discount.
2. WHILE the store is closed, the order service SHALL queue incoming orders.
3. WHERE gift wrapping is enabled, the packing station SHALL add a gift note to the parcel.
