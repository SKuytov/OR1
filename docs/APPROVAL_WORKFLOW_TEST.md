# Approval Workflow Testing Guide

Complete end-to-end testing guide for PartPulse Orders Manager Approval System

## Overview

This document provides a comprehensive testing checklist for the complete approval workflow implementation, covering all three user roles: Requester, Procurement, and Manager.

---

## Prerequisites

### Test Users Setup

Create the following test users (via Users tab as admin):

1. **Requester User**
   - Username: `john.requester`
   - Role: Requester
   - Building: CT
   - Email: your-email+req@example.com

2. **Procurement User**
   - Username: `alice.procurement`
   - Role: Procurement
   - Email: your-email+proc@example.com

3. **Manager User**
   - Username: `bob.manager`
   - Role: Manager
   - Email: your-email+mgr@example.com

### Test Data Setup

Ensure you have:
- At least 1 active Building (e.g., "CT")
- At least 1 Cost Center for that building
- At least 1 active Supplier (e.g., "Acme Parts Co.")

---

## Test Workflow - Complete End-to-End

### Phase 1: Requester Creates Order

**Login as:** `john.requester`

#### Step 1.1: Create New Order
1. Building should be pre-selected (CT)
2. Select a cost center
3. Fill in:
   - Item Description: "Hydraulic Pump - Model XYZ-500"
   - Part Number: "HYD-XYZ-500"
   - Category: "Hydraulics"
   - Quantity: 2
   - Date Needed: (select a date 2 weeks from now)
   - Priority: High
   - Notes: "Urgent replacement for Line 3 production"
4. Optionally attach a PDF quote or image
5. Click "Submit Order"

**Expected Result:**
- ✅ Success message appears
- ✅ Form clears
- ✅ New order appears in orders list with status "New"
- ✅ File attachment (if added) is visible

#### Step 1.2: Verify Requester View
1. Check that orders table shows the new order
2. Click "View" button to open order detail panel
3. Verify all information is correct
4. Note the Order ID (e.g., #42)

**Expected Result:**
- ✅ Order details are accurate
- ✅ Status badge shows "New"
- ✅ Priority pill shows "High" in orange
- ✅ Attachments are visible and downloadable

---

### Phase 2: Procurement Creates Quote & Submits for Approval

**Logout and login as:** `alice.procurement`

#### Step 2.1: Review Orders
1. Navigate to Orders tab
2. Locate the order created by John (Order #42)
3. Select the checkbox next to the order
4. Verify "1 selected" badge appears

**Expected Result:**
- ✅ Orders tab is visible
- ✅ Order selection works
- ✅ Selection counter updates

#### Step 2.2: Create Quote
1. Click "Create Quote from Selected"
2. Dialog appears with:
   - Supplier dropdown
   - Valid until date input
3. Select supplier: "Acme Parts Co."
4. Enter valid until: (date 30 days from now in YYYY-MM-DD format)
5. Click "Create"

**Expected Result:**
- ✅ Success alert shows quote number (e.g., "Quote QT-2026-0001 created")
- ✅ Selection clears
- ✅ Orders table refreshes

#### Step 2.3: Open Quote Details
1. Navigate to Quotes tab
2. Find the newly created quote (QT-2026-0001)
3. Click "View" button
4. Quote detail panel opens on right side

**Expected Result:**
- ✅ Quote details show:
  - Quote number
  - Supplier: Acme Parts Co.
  - Status: Draft
  - Items: 1
  - Total: 0.00 (not yet priced)
- ✅ Items table shows Order #42

#### Step 2.4: Update Quote Pricing
1. In quote detail panel:
   - Status: Change to "Received"
   - Notes: "Supplier quote received via email"
2. Click "Save"
3. Wait for confirmation

**Expected Result:**
- ✅ "Quote updated" alert
- ✅ Quotes table refreshes
- ✅ Status shows "Received"

#### Step 2.5: Submit Quote for Approval
1. With quote detail panel still open
2. Locate "Approval Workflow" section (should be visible above "Update Quote")
3. Click "📋 Submit for Approval" button
4. Approval submission dialog opens

**Expected Result:**
- ✅ Dialog appears with:
  - Quote summary (number, supplier, total, valid until)
  - Manager dropdown (populated with active managers)
  - Priority selector
  - Comments text area

#### Step 2.6: Complete Approval Submission
1. Select Manager: Bob Manager
2. Set Priority: High
3. Add Comments: "Please approve by EOD - production line is down"
4. Click "Submit for Approval"

**Expected Result:**
- ✅ Success alert: "Approval request submitted successfully!" with Approval ID
- ✅ Dialog closes
- ✅ Quotes table refreshes
- ✅ Quote status automatically changes to "Under Approval"
- ✅ Email sent to Bob Manager (if email configured)

---

### Phase 3: Manager Reviews & Approves

**Logout and login as:** `bob.manager`

#### Step 3.1: Check Approvals Tab
1. After login, check navigation tabs
2. **Approvals** tab should be visible
3. Red notification badge should show "1" (pending count)

**Expected Result:**
- ✅ Approvals tab is visible
- ✅ Badge shows "1" in red circle
- ✅ Manager role badge displays correctly

#### Step 3.2: View Pending Approvals
1. Click on "Approvals" tab
2. Approvals table loads
3. Default filter: "Pending" is selected
4. One approval request is visible

**Expected Result:**
- ✅ Approvals table shows:
  - Approval ID
  - Status badge (yellow "Pending")
  - Priority pill (orange "High")
  - Quote number (QT-2026-0001)
  - Building (CT)
  - Supplier (Acme Parts Co.)
  - Items count (1)
  - Submitted date
  - View button

#### Step 3.3: Review Approval Details
1. Click "View" button on the approval
2. Approval detail panel opens on right side
3. Review all information:
   - Approval request details
   - Quote information
   - Order items summary
   - Submitter comments

**Expected Result:**
- ✅ Detail panel shows complete information
- ✅ Quote document link is clickable (if uploaded)
- ✅ Approve (✓) and Reject (✗) buttons are visible
- ✅ Comments field is present

#### Step 3.4: Approve the Request
1. In comments field, type: "Approved. Proceed with purchase order."
2. Click green "✓ Approve" button
3. Confirmation dialog may appear (depends on implementation)

**Expected Result:**
- ✅ Success message: "Approval request approved successfully"
- ✅ Detail panel closes
- ✅ Approvals table refreshes
- ✅ Approved request disappears from "Pending" filter
- ✅ Badge count decreases to 0
- ✅ Email sent to Alice (procurement) with approval notification

#### Step 3.5: Verify Approval History
1. Change filter from "Pending" to "All Statuses"
2. Locate the approved request
3. Click "View" to see details

**Expected Result:**
- ✅ Status badge shows green "Approved"
- ✅ Approved date is recorded
- ✅ Manager comments are visible
- ✅ Approve/Reject buttons are hidden (already processed)

---

### Phase 4: Procurement Completes Order

**Logout and login as:** `alice.procurement`

#### Step 4.1: Check Quote Status
1. Navigate to Quotes tab
2. Find quote QT-2026-0001
3. Verify status is "Approved"

**Expected Result:**
- ✅ Quote status shows "Approved"
- ✅ Approved date is visible

#### Step 4.2: Update Order Status
1. Navigate to Orders tab
2. Find Order #42
3. Click "View" to open detail
4. In "Update Order" section:
   - Status: Change to "Approved"
   - Supplier: Acme Parts Co. (if not already set)
   - Expected Delivery: (select date 2 weeks from now)
   - Unit Price: 450.00
   - Total Price: 900.00 (2 x 450)
5. Click "Save"

**Expected Result:**
- ✅ "Order updated" confirmation
- ✅ Order status changes to "Approved"
- ✅ Pricing information is saved
- ✅ History entry is created (if history logging is enabled)

#### Step 4.3: Mark as Ordered
1. Change order status to "Ordered"
2. Click "Save" again

**Expected Result:**
- ✅ Status updates to "Ordered"
- ✅ Order is ready for delivery tracking

---

## Additional Test Cases

### Test Case: Rejection Workflow

Repeat the workflow but at Step 3.4, instead of approving:

1. Enter comment: "Quote too high. Please negotiate better pricing."
2. Click red "✗ Reject" button
3. Verify:
   - ✅ Status changes to "Rejected"
   - ✅ Procurement receives rejection notification
   - ✅ Quote status can be updated back to "Draft" for resubmission

### Test Case: Multiple Pending Approvals

1. Create 3-4 orders as requester
2. Create separate quotes for each as procurement
3. Submit all for approval
4. As manager, verify:
   - ✅ Badge shows correct count (e.g., "4")
   - ✅ All approvals appear in list
   - ✅ Filters work correctly
   - ✅ Search works across all fields

### Test Case: Priority Filtering

1. Create approvals with different priorities (Low, Normal, High, Urgent)
2. Use priority filter dropdown
3. Verify:
   - ✅ Filtering works correctly
   - ✅ Only matching priorities show
   - ✅ Clear filters button resets

### Test Case: Real-time Search

1. With multiple approvals loaded
2. Type in search box: "hydraulic"
3. Verify:
   - ✅ Table filters in real-time
   - ✅ Only matching approvals show
   - ✅ Search works across description, supplier, building

---

## Common Issues & Troubleshooting

### Issue: "Submit for Approval" button not visible

**Cause:** Quote status is not "Draft" or "Received"

**Solution:**
1. Update quote status to "Received"
2. Save changes
3. Reopen quote detail panel

### Issue: No managers in dropdown

**Cause:** No users with "manager" role exist or they are inactive

**Solution:**
1. Login as admin
2. Navigate to Users tab
3. Create or activate a manager user

### Issue: Badge count not updating

**Cause:** Page needs refresh

**Solution:**
1. Click "Refresh" button on Approvals tab
2. Or logout and login again

### Issue: Email notifications not received

**Cause:** Email not configured in backend or email service not running

**Solution:**
1. Check backend .env file for email configuration
2. Verify SMTP settings are correct
3. Test email service independently

---

## Success Criteria Checklist

### Frontend Integration
- ☐ Approvals tab visible for managers
- ☐ Badge shows pending approval count
- ☐ Submit for approval button appears in quote detail
- ☐ Manager selection dialog works
- ☐ Approval submission completes successfully

### Manager UI
- ☐ Approvals table loads correctly
- ☐ Filters work (status, priority, search)
- ☐ Approve button changes status
- ☐ Reject button changes status
- ☐ Comments are saved
- ☐ Detail panel shows complete information

### Workflow Integration
- ☐ Quote status updates to "Under Approval"
- ☐ Approval creates database record
- ☐ Manager receives notification (if email enabled)
- ☐ Procurement receives decision notification
- ☐ Order status can progress after approval

### Data Integrity
- ☐ All approval fields save correctly
- ☐ History is maintained
- ☐ Timestamps are accurate
- ☐ User associations are correct

---

## Performance Checks

- Page load time < 2 seconds
- Approval submission < 1 second
- Real-time search filters < 500ms
- Badge update after action < 1 second

---

## Browser Compatibility

Test on:
- ☐ Chrome/Edge (Chromium)
- ☐ Firefox
- ☐ Safari

---

## Next Steps After Testing

1. **Document Issues:** Create GitHub issues for any bugs found
2. **Performance Optimization:** If slow, consider pagination or lazy loading
3. **Email Templates:** Customize approval notification emails
4. **Reporting:** Add approval metrics dashboard
5. **Audit Trail:** Ensure all approval decisions are logged

---

## Version History

- **v1.0** (2026-02-22): Initial approval workflow implementation
  - Manager role support
  - Quote submission for approval
  - Approval request management
  - Decision workflow (approve/reject)

---

**Test Date:** _______________

**Tested By:** _______________

**Result:** ☐ PASS  ☐ FAIL

**Notes:**

_______________________________________________

_______________________________________________

_______________________________________________
