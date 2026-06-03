# Technical Design Document

## Overview

This document describes the technical design for the EventHub Frontend — a static HTML application using Alpine.js for reactivity and Pico.css for styling. The frontend consumes the existing EventHub REST API and is organized as three files: `index.html` (public page), `admin.html` (admin page), and `app.js` (shared logic). All files live in a `frontend/` directory at the project root.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  index.html  │    │  admin.html  │    │    app.js    │  │
│  │  (Public)    │    │  (Admin)     │    │  (Shared)    │  │
│  │              │    │              │    │              │  │
│  │ Alpine.js    │    │ Alpine.js    │    │ - API_BASE   │  │
│  │ components   │    │ components   │    │ - apiClient  │  │
│  │              │    │              │    │ - components │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘  │
│         │                   │                               │
│         └─────────┬─────────┘                               │
│                   │                                         │
└───────────────────┼─────────────────────────────────────────┘
                    │ HTTP (fetch)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS API Gateway (HTTP API)                       │
│                                                             │
│  GET /events              GET /health                       │
│  GET /events/{id}         POST /admin/simulate-error        │
│  POST /registrations      GET /admin/registrations          │
│  GET /registrations/{id}  GET /admin/registrations/{id}     │
│  POST /registrations/{id}/upload-url                        │
│  POST /admin/registrations/{id}/approve                     │
│  POST /admin/registrations/{id}/reject                      │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
frontend/
├── index.html      # Public participant page
├── admin.html      # Admin management page
└── app.js          # Shared API client + Alpine.js component definitions
```

## Data Models

These mirror the backend TypeScript types and represent the shapes returned by the API:

```javascript
// Event object from GET /events and GET /events/{eventId}
{
  eventId: string,
  title: string,
  description: string,
  date: string,         // ISO 8601
  location: string,
  capacity: number,
  availableSlots: number,
  status: 'ACTIVE' | 'INACTIVE'
}

// Registration object from GET /registrations/{id} and admin endpoints
{
  id: string,           // UUID
  participantId: string,
  eventId: string,
  status: 'PENDING_DOCUMENT' | 'DOCUMENT_UPLOADED' | 'APPROVED' | 'REJECTED',
  documentS3Key: string | null,
  rejectionReason: string | null,
  createdAt: string,    // ISO 8601
  updatedAt: string     // ISO 8601
}

// Error response from all endpoints on failure
{
  statusCode: number,
  message: string,
  correlationId: string
}

// Upload URL response from POST /registrations/{id}/upload-url
{
  uploadUrl: string,
  key: string,
  expiresIn: number     // seconds (300)
}

// Health response from GET /health
{
  status: string,
  timestamp: string     // ISO 8601
}
```

## Components and Interfaces

### app.js — Shared Module

The `app.js` file is loaded by both HTML pages and contains:

1. **Configuration block** — `API_BASE_URL` variable at the top
2. **`apiClient` object** — Centralized HTTP helper using `fetch()`
3. **Alpine.js `data()` component factories** — One per page section, registered via `Alpine.data()`

#### API Client

```javascript
const API_BASE_URL = ''; // Set to deployed API Gateway URL, e.g. 'https://abc123.execute-api.us-east-1.amazonaws.com'

const apiClient = {
  baseUrl() {
    let url = API_BASE_URL;
    if (!url || typeof url !== 'string') url = 'http://localhost:3000';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.warn('[EventHub] Invalid API_BASE_URL, falling back to default');
      url = 'http://localhost:3000';
    }
    return url.replace(/\/$/, '');
  },

  async request(method, path, body = null) {
    const url = `${this.baseUrl()}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.message || (response.status >= 500
        ? 'Server error, please try again later'
        : 'Request error');
      throw { status: response.status, message, data };
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
};
```

#### Alpine.js Component: `eventsPage`

Registered via `Alpine.data('eventsPage', () => ({...}))`. Used by `index.html`.

**State:**
- `events: []` — list of events
- `loading: boolean` — loading state
- `error: string | null` — error message
- `selectedEvent: object | null` — currently viewed event details
- `showRegisterForm: boolean` — toggle registration form
- `registration: { name, email, eventId }` — form data
- `registrationResult: object | null` — result after successful registration
- `submitting: boolean` — form submission state
- `statusCheckId: string` — input for status lookup
- `statusResult: object | null` — registration status result
- `uploadFile: File | null` — selected file for upload
- `uploading: boolean` — upload in progress
- `uploadProgress: number` — 0-100

**Methods:**
- `init()` — calls `fetchEvents()`
- `fetchEvents()` — GET /events, sorts by date ascending
- `viewEvent(eventId)` — GET /events/{eventId}
- `backToList()` — clears selectedEvent
- `submitRegistration()` — validates, POST /registrations
- `checkStatus()` — validates UUID, GET /registrations/{id}
- `uploadDocument()` — POST /registrations/{id}/upload-url, then PUT to presigned URL

#### Alpine.js Component: `adminPage`

Registered via `Alpine.data('adminPage', () => ({...}))`. Used by `admin.html`.

**State:**
- `registrations: []` — list of all registrations
- `loading: boolean` — loading state
- `error: string | null` — error message
- `selectedRegistration: object | null` — detail view
- `detailLoading: boolean` — detail fetch loading
- `actionLoading: boolean` — approve/reject in progress
- `rejectReason: string` — text input for rejection reason
- `showRejectPrompt: boolean` — toggle reject reason input
- `healthResult: object | null` — health check response
- `simulateResult: object | null` — simulate error response
- `toolLoading: string | null` — which tool button is loading

**Methods:**
- `init()` — calls `fetchRegistrations()`
- `fetchRegistrations()` — GET /admin/registrations, sorts by createdAt desc
- `viewRegistration(id)` — GET /admin/registrations/{id}
- `backToList()` — clears selectedRegistration
- `approveRegistration(id)` — POST /admin/registrations/{id}/approve
- `rejectRegistration(id)` — validates reason, POST /admin/registrations/{id}/reject
- `healthCheck()` — GET /health
- `simulateError()` — POST /admin/simulate-error

### Notification System

A lightweight Alpine.js component `notification` shared across both pages:

**State:**
- `message: string | null`
- `type: 'error' | 'success'`
- `timer: number | null`

**Methods:**
- `show(message, type)` — displays message, sets 8s auto-dismiss timer
- `dismiss()` — clears message and timer

Exposed globally via `Alpine.store('notification', {...})` so any component can call `this.$store.notification.show(msg, type)`.

## HTML Page Structure

### index.html (Public Page)

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EventHub - Eventos</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="app.js"></script>
</head>
<body>
  <main class="container" x-data="eventsPage">
    <!-- Notification bar -->
    <!-- Event listing / Event details / Registration form / Status check / Upload -->
  </main>
</body>
</html>
```

**Sections (toggled via Alpine.js state):**
1. **Event List** — shown when `!selectedEvent`, iterates `events`
2. **Event Detail** — shown when `selectedEvent && !showRegisterForm`
3. **Registration Form** — shown when `showRegisterForm`
4. **Registration Result** — shown after successful registration, includes status check and upload
5. **Status Check** — standalone section always visible at bottom

### admin.html (Admin Page)

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EventHub - Admin</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="app.js"></script>
</head>
<body>
  <main class="container" x-data="adminPage">
    <!-- Notification bar -->
    <!-- Operational tools section -->
    <!-- Registration list / Registration detail with actions -->
  </main>
</body>
</html>
```

**Sections:**
1. **Operational Tools** — Health Check and Simulate Error buttons with response display
2. **Registration List** — table with clickable rows
3. **Registration Detail** — shown when `selectedRegistration`, includes approve/reject buttons

## Status Badge Styling

Inline styles using CSS custom properties from Pico.css, no external stylesheet needed:

| Status | Color | Display Text |
|--------|-------|-------------|
| PENDING_DOCUMENT | `#f0ad4e` (yellow/amber) | Pending Document |
| DOCUMENT_UPLOADED | `#5bc0de` (blue) | Document Uploaded |
| APPROVED | `#5cb85c` (green) | Approved |
| REJECTED | `#d9534f` (red) | Rejected |

Implemented as a small inline `<span>` with `style` attribute based on status value.

## Upload Flow (Sequence)

```
Participant          Frontend (app.js)         API Gateway           S3
    │                      │                       │                  │
    │  select file         │                       │                  │
    ├─────────────────────►│                       │                  │
    │                      │  POST /registrations/{id}/upload-url     │
    │                      ├──────────────────────►│                  │
    │                      │  { uploadUrl, key }   │                  │
    │                      │◄──────────────────────┤                  │
    │                      │                       │                  │
    │                      │  PUT uploadUrl (file binary)             │
    │                      ├─────────────────────────────────────────►│
    │                      │  200 OK               │                  │
    │                      │◄─────────────────────────────────────────┤
    │  success message     │                       │                  │
    │◄─────────────────────┤                       │                  │
```

## Validation Rules

### Registration Form (client-side)
- **name**: required, 2–150 characters
- **email**: required, valid email format, max 254 characters
- **eventId**: required (auto-filled from selected event)

### Status Check Input
- **registrationId**: must match UUID v4 pattern `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

### Upload Widget
- **file type**: `application/pdf`, `image/png`, `image/jpeg`
- **file size**: max 5 MB (5,242,880 bytes)

## Serving & Development

For local development:
```bash
cd frontend
npx serve .
# or
python3 -m http.server 8080
```

The `API_BASE_URL` in `app.js` should be set to the deployed API Gateway URL (from `sam deploy` output). For local testing with SAM local, set it to `http://localhost:3000`.

## Error Handling

All API calls go through `apiClient.request()` which handles errors at three levels:

1. **Network errors** — `fetch()` throws a `TypeError` when the network is unreachable. Caught and surfaced as "Connection error, check your network".
2. **HTTP 4xx errors** — Response body is parsed for a `message` field. If present, displayed verbatim. If not parseable, falls back to "Request error".
3. **HTTP 5xx errors** — Always displays "Server error, please try again later" regardless of response body content.

Error objects thrown by `apiClient` have the shape `{ status: number, message: string, data: object | null }`. Each Alpine.js component catches these in try/catch blocks and delegates display to `this.$store.notification.show(error.message, 'error')`.

The notification store auto-dismisses after 8 seconds and replaces any existing message when a new one arrives.

## Correctness Properties

### Property 1: Single Source of Truth for API URL
All requests route through `apiClient` which reads `API_BASE_URL` once. No direct `fetch()` calls exist outside `apiClient`.
**Validates: Requirements 1.1, 1.3**

### Property 2: Idempotent UI State
Each page section is driven by a single state variable (`selectedEvent`, `selectedRegistration`). Navigating back always resets to list view.
**Validates: Requirements 2.1, 7.1**

### Property 3: Optimistic Locking Prevention
Approve/reject buttons are disabled immediately on click and only re-enabled on failure. This prevents double-submission.
**Validates: Requirements 8.4, 8.7**

### Property 4: Upload Atomicity
The upload flow is two-step (get URL, then PUT). If step 1 succeeds but step 2 fails, the user can retry which requests a fresh presigned URL.
**Validates: Requirements 6.4, 6.7**

### Property 5: Client-Side Validation Mirrors Server
Name length (2–150), email format, UUID format, and file type/size constraints match backend validation rules to avoid unnecessary round-trips.
**Validates: Requirements 4.2, 4.3, 5.1, 6.1**

## Testing Strategy

Since this is a static frontend with no build step, testing is manual and browser-based:

1. **Local smoke test** — Serve `frontend/` with `npx serve .` and verify both pages load, Alpine.js initializes, and Pico.css applies.
2. **API integration test** — Point `API_BASE_URL` to the deployed stack and exercise the full flow: list events → register → check status → upload document → admin approve.
3. **Error state verification** — Temporarily set `API_BASE_URL` to an invalid URL and confirm error messages appear correctly for network failures.
4. **Validation testing** — Submit forms with invalid data (empty name, bad email, non-UUID status check) and verify client-side validation prevents API calls.
5. **Cross-browser** — Verify in Chrome and Firefox (Alpine.js and fetch are supported in all modern browsers).

## Requirements Traceability

| Requirement | Component/File | Implementation |
|-------------|---------------|----------------|
| Req 1 | app.js | `API_BASE_URL` variable + `apiClient.baseUrl()` |
| Req 2 | index.html + eventsPage | `fetchEvents()` method + event card template |
| Req 3 | index.html + eventsPage | `viewEvent()` method + detail template |
| Req 4 | index.html + eventsPage | `submitRegistration()` + form validation |
| Req 5 | index.html + eventsPage | `checkStatus()` + UUID validation |
| Req 6 | index.html + eventsPage | `uploadDocument()` + presigned URL flow |
| Req 7 | admin.html + adminPage | `fetchRegistrations()` + table template |
| Req 8 | admin.html + adminPage | `viewRegistration()` + approve/reject methods |
| Req 9 | admin.html + adminPage | `healthCheck()` + `simulateError()` methods |
| Req 10 | All files | Static HTML + CDN deps + relative paths |
| Req 11 | app.js | `notification` store + `apiClient` error handling |
