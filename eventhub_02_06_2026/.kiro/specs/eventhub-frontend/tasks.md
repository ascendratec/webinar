# Implementation Plan: EventHub Frontend

## Overview

Build a static HTML frontend using Alpine.js and Pico.css that consumes the existing EventHub REST API. The implementation is organized into three files (`frontend/index.html`, `frontend/admin.html`, `frontend/app.js`) with no build step required. Tasks progress from shared infrastructure (API client, notification system) through the public page features to the admin page features, wiring everything together incrementally.

## Tasks

- [x] 1. Create project structure and shared app.js with API client and notification system
  - [x] 1.1 Create `frontend/app.js` with API_BASE_URL configuration, apiClient object, and notification Alpine store
    - Create the `frontend/` directory and `app.js` file
    - Implement `API_BASE_URL` variable at the top with empty string default
    - Implement `apiClient` object with `baseUrl()` method that falls back to `http://localhost:3000` for empty/invalid URLs and logs a console warning for non-http(s) URLs
    - Implement `apiClient.request(method, path, body)` using `fetch()` with JSON headers, parsing error responses into `{ status, message, data }` shape
    - Implement `apiClient.get(path)` and `apiClient.post(path, body)` convenience methods
    - Handle network errors (TypeError from fetch) as "Connection error, check your network"
    - Handle 4xx with `message` field from response body, fallback to "Request error"
    - Handle 5xx as "Server error, please try again later"
    - Register `Alpine.store('notification', {...})` with `show(message, type)`, `dismiss()`, 8-second auto-dismiss timer, and message replacement logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 2. Implement public page (index.html) with event listing and details
  - [x] 2.1 Create `frontend/index.html` with HTML boilerplate, CDN links for Pico.css and Alpine.js, and script reference to `app.js`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 2.2 Implement `eventsPage` Alpine component in `app.js` with event listing and detail view
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 2.3 Add event listing and detail view templates to `index.html`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Implement public page registration form and status check
  - [x] 3.1 Add registration form logic to `eventsPage` component in `app.js`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.2 Add status check logic to `eventsPage` component in `app.js`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.3 Add registration form and status check templates to `index.html`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 4. Implement public page document upload
  - [x] 4.1 Add upload logic to `eventsPage` component in `app.js`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 4.2 Add upload widget template to `index.html`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 5. Checkpoint - Verify public page functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement admin page with registration list and details
  - [x] 6.1 Create `frontend/admin.html` with HTML boilerplate, CDN links, and script reference
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.2 Implement `adminPage` Alpine component in `app.js` with registration list and detail view
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.8_

  - [x] 6.3 Add registration list and detail templates to `admin.html`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.8_

- [x] 7. Implement admin page approve/reject actions
  - [x] 7.1 Add approve/reject logic to `adminPage` component in `app.js`
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 7.2 Add approve/reject action templates to `admin.html`
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 8. Implement admin page operational tools
  - [x] 8.1 Add operational tools logic to `adminPage` component in `app.js`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.2 Add operational tools section template to `admin.html`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 9. Final checkpoint - Ensure all files are complete and integrated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add S3 bucket and CloudFront distribution to SAM template
  - [x] 10.1 Add S3 bucket resource for frontend static files to `template.yaml`
  - [x] 10.2 Add CloudFront Origin Access Control (OAC) to `template.yaml`
  - [x] 10.3 Add CloudFront distribution to `template.yaml`
  - [x] 10.4 Add S3 bucket policy allowing CloudFront OAC access
  - [x] 10.5 Add stack outputs for frontend URL, bucket name, and distribution ID

- [x] 11. Create frontend deployment script
  - [x] 11.1 Create `scripts/deploy-frontend.sh` deployment script
  - [x] 11.2 Update `app.js` API_BASE_URL to use a placeholder pattern for deployment injection

- [x] 12. Final integration checkpoint - Verify SAM template validates and frontend deploys

## Notes

- No build step is required — all files are plain HTML/JS served statically
- Alpine.js and Pico.css are loaded from CDN, no local dependencies needed

### Branch-to-Task Mapping

| Branch | Backend Adds | Frontend Tasks |
|--------|-------------|----------------|
| step-05 | GET /health, GET /events, GET /events/{id} | 1, 2, 8 (health only), 10, 11 |
| step-06 | POST /registrations, GET /registrations/{id} | 3 (registration form + status check) |
| step-07 | POST /registrations/{id}/upload-url, S3 processing | 4 (document upload) |
| step-08 | POST /admin/simulate-error | 8 (simulate error) |
| step-09 | GET /admin/registrations, approve, reject | 6, 7 (admin registration list + actions) |
| step-10 | Final architecture | 5, 9, 12 (checkpoints) |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "6.2"] },
    { "id": 3, "tasks": ["2.3", "3.1", "3.2", "6.3", "7.1", "8.1"] },
    { "id": 4, "tasks": ["3.3", "4.1", "7.2", "8.2"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["10.1", "10.2"] },
    { "id": 7, "tasks": ["10.3", "10.4"] },
    { "id": 8, "tasks": ["10.5"] },
    { "id": 9, "tasks": ["11.1", "11.2"] }
  ]
}
```
